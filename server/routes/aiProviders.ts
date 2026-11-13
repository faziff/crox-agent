import { Router, Response } from 'express';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import {
  addProviderKey,
  deleteProviderKey,
  discoverProviderModels,
  listProvidersForUser,
  testProviderOrKey,
  updateProviderKey,
  upsertProviderConfig,
} from '../services/aiProviderService.ts';
import { AiProviderId } from '../../src/types/workflow.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const providers = listProvidersForUser(db, req.user!.id);
  res.json({ providers });
});

router.put('/:providerId/config', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const providerId = req.params.providerId as AiProviderId;
    const provider = upsertProviderConfig(db, req.user!.id, providerId, {
      baseUrl: req.body?.baseUrl,
      defaultModel: req.body?.defaultModel,
      backupProviderId: req.body?.backupProviderId,
      isPrimary: req.body?.isPrimary,
      isEnabled: req.body?.isEnabled,
    });
    res.json({ provider });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update provider.' });
  }
});

router.post('/:providerId/discover-models', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const providerId = req.params.providerId as AiProviderId;
    const models = await discoverProviderModels(db, req.user!.id, providerId);
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to discover models.' });
  }
});

router.post('/:providerId/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const providerId = req.params.providerId as AiProviderId;
    const result = await testProviderOrKey(db, req.user!.id, providerId, req.body?.keyId);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Provider test failed.' });
  }
});

router.post('/:providerId/keys', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const providerId = req.params.providerId as AiProviderId;
    const key = addProviderKey(db, req.user!.id, providerId, {
      label: String(req.body?.label || ''),
      apiKey: String(req.body?.apiKey || ''),
      isPrimary: Boolean(req.body?.isPrimary),
      projectTag: String(req.body?.projectTag || ''),
    });
    res.status(201).json({ key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to store API key.';
    const status = msg.includes('CREDENTIAL_ENCRYPTION_KEY') ? 503 : 400;
    res.status(status).json({ error: msg });
  }
});

router.patch('/keys/:keyId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const key = updateProviderKey(db, req.user!.id, req.params.keyId, {
      label: req.body?.label,
      isPrimary: req.body?.isPrimary,
      isEnabled: req.body?.isEnabled,
      projectTag: req.body?.projectTag,
    });
    res.json({ key });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update API key.' });
  }
});

router.delete('/keys/:keyId', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const ok = deleteProviderKey(db, req.user!.id, req.params.keyId);
  if (!ok) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }
  res.json({ ok: true });
});

router.post('/keys/:keyId/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT provider_id FROM ai_provider_keys WHERE id = ? AND user_id = ?')
      .get(req.params.keyId, req.user!.id) as { provider_id: AiProviderId } | undefined;
    if (!row) {
      res.status(404).json({ error: 'API key not found.' });
      return;
    }
    const result = await testProviderOrKey(db, req.user!.id, row.provider_id, req.params.keyId);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Key verification failed.' });
  }
});

export default router;
