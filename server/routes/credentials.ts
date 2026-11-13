import { Router, Response } from 'express';
import { getCredentialEncryptionKey } from '../config.ts';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  generateRandomToken,
  maskSecret,
} from '../utils/crypto.ts';
import { assertSafeExternalUrl, safeFetch } from '../utils/ssrf.ts';
import { CredentialRecord, CredentialType } from '../../src/types/workflow.ts';

const router = Router();
router.use(requireAuth);

const VALID_TYPES = new Set<CredentialType>([
  'api_key',
  'ai_provider',
  'oauth2',
  'email_smtp',
  'http_auth',
  'app_credential',
]);

function mapCredentialRow(
  row: Record<string, unknown>,
  usageMap?: Map<string, Array<{ id: string; name: string }>>
): CredentialRecord {
  let providerMeta: Record<string, unknown> = {};
  try {
    providerMeta = JSON.parse((row.provider_meta as string) || '{}');
  } catch {
    providerMeta = {};
  }
  const id = row.id as string;
  return {
    id,
    userId: row.user_id as string,
    label: row.label as string,
    type: row.type as CredentialType,
    maskedPreview: row.masked_preview as string,
    isEnabled: row.is_enabled === undefined ? true : Boolean(row.is_enabled),
    providerMeta,
    usedInWorkflows: usageMap ? usageMap.get(id) || [] : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function buildCredentialUsageMap(
  db: ReturnType<typeof getDb>,
  userId: string
): Map<string, Array<{ id: string; name: string }>> {
  const usage = new Map<string, Array<{ id: string; name: string }>>();
  const wfRows = db
    .prepare('SELECT id, name, nodes_json FROM workflows WHERE user_id = ?')
    .all(userId) as Array<{ id: string; name: string; nodes_json: string }>;

  for (const wf of wfRows) {
    try {
      const nodes = JSON.parse(wf.nodes_json || '[]') as Array<{
        type?: string;
        data?: { config?: { credentialId?: string } };
      }>;
      const seenInWf = new Set<string>();
      for (const n of nodes) {
        const credId = n?.data?.config?.credentialId;
        if (credId && typeof credId === 'string' && !seenInWf.has(credId)) {
          seenInWf.add(credId);
          const list = usage.get(credId) || [];
          list.push({ id: wf.id, name: wf.name });
          usage.set(credId, list);
        }
      }
    } catch {
      // ignore malformed node JSON
    }
  }
  return usage;
}

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, label, type, masked_preview, is_enabled, provider_meta, created_at, updated_at
       FROM credentials WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user!.id) as Array<Record<string, unknown>>;

  const usageMap = buildCredentialUsageMap(db, req.user!.id);
  const encKey = getCredentialEncryptionKey();
  res.json({
    credentials: rows.map((r) => mapCredentialRow(r, usageMap)),
    encryptionConfigured: Boolean(encKey),
  });
});

router.post('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const label = String(req.body?.label || '').trim();
    const type = String(req.body?.type || '') as CredentialType;
    const secretValue = String(req.body?.secretValue || '').trim();
    const providerMeta =
      req.body?.providerMeta && typeof req.body.providerMeta === 'object'
        ? JSON.stringify(req.body.providerMeta)
        : '{}';

    if (!label || label.length < 2) {
      res.status(400).json({ error: 'Credential label must be at least 2 characters.' });
      return;
    }
    if (!VALID_TYPES.has(type)) {
      res.status(400).json({ error: 'Invalid credential type.' });
      return;
    }
    if (!secretValue) {
      res.status(400).json({ error: 'Secret or API key value is required.' });
      return;
    }

    const encrypted = encryptCredentialPayload(secretValue);
    const maskedPreview = maskSecret(secretValue);
    const id = `cred_${generateRandomToken(8)}`;
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(
      `INSERT INTO credentials
         (id, user_id, label, type, encrypted_payload, iv, auth_tag, masked_preview, is_enabled, provider_meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      id,
      req.user!.id,
      label,
      type,
      encrypted.encryptedPayload,
      encrypted.iv,
      encrypted.authTag,
      maskedPreview,
      providerMeta,
      now,
      now
    );

    const row = db
      .prepare(
        'SELECT id, user_id, label, type, masked_preview, is_enabled, provider_meta, created_at, updated_at FROM credentials WHERE id = ?'
      )
      .get(id) as Record<string, unknown>;

    res.status(201).json({ credential: mapCredentialRow(row) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to store credential.';
    const status = msg.includes('CREDENTIAL_ENCRYPTION_KEY') ? 503 : 500;
    res.status(status).json({ error: msg });
  }
});

router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM credentials WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Credential not found.' });
      return;
    }

    const label = req.body?.label !== undefined ? String(req.body.label).trim() : (existing.label as string);
    const type = (req.body?.type !== undefined ? String(req.body.type) : (existing.type as string)) as CredentialType;
    const newSecret = req.body?.secretValue !== undefined ? String(req.body.secretValue).trim() : '';
    const providerMeta =
      req.body?.providerMeta && typeof req.body.providerMeta === 'object'
        ? JSON.stringify(req.body.providerMeta)
        : ((existing.provider_meta as string) || '{}');

    if (!label || label.length < 2) {
      res.status(400).json({ error: 'Credential label must be at least 2 characters.' });
      return;
    }
    if (!VALID_TYPES.has(type)) {
      res.status(400).json({ error: 'Invalid credential type.' });
      return;
    }

    const now = new Date().toISOString();
    if (newSecret) {
      const encrypted = encryptCredentialPayload(newSecret);
      const maskedPreview = maskSecret(newSecret);
      db.prepare(
        `UPDATE credentials
         SET label = ?, type = ?, encrypted_payload = ?, iv = ?, auth_tag = ?, masked_preview = ?, provider_meta = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(
        label,
        type,
        encrypted.encryptedPayload,
        encrypted.iv,
        encrypted.authTag,
        maskedPreview,
        providerMeta,
        now,
        req.params.id,
        req.user!.id
      );
    } else {
      db.prepare(
        'UPDATE credentials SET label = ?, type = ?, provider_meta = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      ).run(label, type, providerMeta, now, req.params.id, req.user!.id);
    }

    const updated = db
      .prepare(
        'SELECT id, user_id, label, type, masked_preview, is_enabled, provider_meta, created_at, updated_at FROM credentials WHERE id = ?'
      )
      .get(req.params.id) as Record<string, unknown>;

    const usageMap = buildCredentialUsageMap(db, req.user!.id);
    res.json({ credential: mapCredentialRow(updated, usageMap) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update credential.';
    const status = msg.includes('CREDENTIAL_ENCRYPTION_KEY') ? 503 : 500;
    res.status(status).json({ error: msg });
  }
});

router.patch('/:id/status', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const isEnabled = Boolean(req.body?.isEnabled);
  const resUpd = db
    .prepare('UPDATE credentials SET is_enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(isEnabled ? 1 : 0, new Date().toISOString(), req.params.id, req.user!.id);

  if (resUpd.changes === 0) {
    res.status(404).json({ error: 'Credential not found.' });
    return;
  }

  const updated = db
    .prepare(
      'SELECT id, user_id, label, type, masked_preview, is_enabled, provider_meta, created_at, updated_at FROM credentials WHERE id = ?'
    )
    .get(req.params.id) as Record<string, unknown>;
  const usageMap = buildCredentialUsageMap(db, req.user!.id);
  res.json({ credential: mapCredentialRow(updated, usageMap) });
});

router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM credentials WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Credential not found.' });
      return;
    }
    if (row.is_enabled === 0) {
      res.status(400).json({ error: 'Credential is currently disabled.' });
      return;
    }

    const secret = decryptCredentialPayload(
      row.encrypted_payload as string,
      row.iv as string,
      row.auth_tag as string
    );

    if (!secret || secret.trim().length < 3) {
      res.status(400).json({ error: 'Decrypted credential payload is empty or invalid.' });
      return;
    }

    const type = row.type as CredentialType;
    let providerMeta: Record<string, unknown> = {};
    try {
      providerMeta = JSON.parse((row.provider_meta as string) || '{}');
    } catch {
      providerMeta = {};
    }

    const testUrl = typeof providerMeta.testUrl === 'string' ? providerMeta.testUrl.trim() : '';
    if (testUrl) {
      await assertSafeExternalUrl(testUrl);
      const r = await safeFetch(testUrl, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) {
        res.status(400).json({ error: `Endpoint verification returned HTTP ${r.status}.` });
        return;
      }
      res.json({ ok: true, message: `AES-256-GCM decryption and endpoint check succeeded (${r.status}).` });
      return;
    }

    if (type === 'email_smtp') {
      const parsed = JSON.parse(secret) as { host?: string; user?: string; pass?: string };
      if (!parsed.host || !parsed.user || !parsed.pass) {
        res.status(400).json({ error: 'SMTP JSON must include host, user, and pass fields.' });
        return;
      }
      res.json({ ok: true, message: `SMTP credential "${parsed.host}" decrypted and structurally valid.` });
      return;
    }

    res.json({ ok: true, message: 'Credential decrypted with AES-256-GCM and ready for workflow execution.' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Credential verification failed.' });
  }
});

router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Credential not found.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
