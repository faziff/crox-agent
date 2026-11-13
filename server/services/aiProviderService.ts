import { GoogleGenAI } from '@google/genai';
import Database from 'better-sqlite3';
import { getGeminiApiKey } from '../config.ts';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  generateRandomToken,
  maskSecret,
} from '../utils/crypto.ts';
import { assertSafeExternalUrl, safeFetch } from '../utils/ssrf.ts';
import {
  AiModelCapability,
  AiModelMetadata,
  AiProviderConfigRecord,
  AiProviderId,
  AiProviderKeyRecord,
} from '../../src/types/workflow.ts';

export interface ProviderDefinition {
  providerId: AiProviderId;
  displayName: string;
  protocol: 'gemini' | 'openai_compatible' | 'anthropic';
  defaultBaseUrl: string;
  requiresKey: boolean;
  supportsModelDiscovery: boolean;
  defaultModel: string;
  capabilities: AiModelCapability;
  verifiedModels: AiModelMetadata[];
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    providerId: 'gemini',
    displayName: 'Google Gemini',
    protocol: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    requiresKey: false,
    supportsModelDiscovery: true,
    defaultModel: 'gemini-3.8-flash',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      embeddings: true,
    },
    verifiedModels: [
      {
        id: 'gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        providerId: 'gemini',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      },
      {
        id: 'gemini-3.1-flash-lite',
        displayName: 'Gemini 3.1 Flash Lite',
        providerId: 'gemini',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      },
    ],
  },
  {
    providerId: 'openai',
    displayName: 'OpenAI',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: 'gpt-4o-mini',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: true,
      jsonMode: true,
      vision: true,
      streaming: true,
      embeddings: true,
    },
    verifiedModels: [
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o mini',
        providerId: 'openai',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      },
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        providerId: 'openai',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      },
    ],
  },
  {
    providerId: 'anthropic',
    displayName: 'Anthropic Claude',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: 'claude-sonnet-5-5',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: true,
      jsonMode: false,
      vision: true,
      streaming: true,
      embeddings: false,
    },
    verifiedModels: [
      {
        id: 'claude-sonnet-5-5',
        displayName: 'Claude Sonnet 5.5',
        providerId: 'anthropic',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: false,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      },
      {
        id: 'claude-haiku-5-5',
        displayName: 'Claude Haiku 5.5',
        providerId: 'anthropic',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: false,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      },
    ],
  },
  {
    providerId: 'groq',
    displayName: 'Groq',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: 'llama-3.3-70b-versatile',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: false,
      jsonMode: true,
      vision: false,
      streaming: true,
      embeddings: false,
    },
    verifiedModels: [
      {
        id: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B Versatile',
        providerId: 'groq',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: false,
          jsonMode: true,
          vision: false,
          streaming: true,
          embeddings: false,
        },
      },
    ],
  },
  {
    providerId: 'openrouter',
    displayName: 'OpenRouter',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: 'openai/gpt-4o-mini',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: false,
      jsonMode: true,
      vision: true,
      streaming: true,
      embeddings: false,
    },
    verifiedModels: [],
  },
  {
    providerId: 'deepseek',
    displayName: 'DeepSeek',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: 'deepseek-chat',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: false,
      jsonMode: true,
      vision: false,
      streaming: true,
      embeddings: false,
    },
    verifiedModels: [
      {
        id: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        providerId: 'deepseek',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: false,
          jsonMode: true,
          vision: false,
          streaming: true,
          embeddings: false,
        },
      },
    ],
  },
  {
    providerId: 'mistral',
    displayName: 'Mistral AI',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: 'mistral-small-latest',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: false,
      jsonMode: true,
      vision: false,
      streaming: true,
      embeddings: true,
    },
    verifiedModels: [
      {
        id: 'mistral-small-latest',
        displayName: 'Mistral Small',
        providerId: 'mistral',
        source: 'verified_catalog',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: false,
          jsonMode: true,
          vision: false,
          streaming: true,
          embeddings: false,
        },
      },
    ],
  },
  {
    providerId: 'ollama',
    displayName: 'Ollama (OpenAI-Compatible)',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    supportsModelDiscovery: true,
    defaultModel: 'llama3.1',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: false,
      jsonMode: true,
      vision: false,
      streaming: true,
      embeddings: true,
    },
    verifiedModels: [],
  },
  {
    providerId: 'openai_compatible',
    displayName: 'Custom OpenAI-Compatible',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    supportsModelDiscovery: true,
    defaultModel: '',
    capabilities: {
      text: true,
      toolCalling: true,
      structuredOutput: false,
      jsonMode: true,
      vision: false,
      streaming: true,
      embeddings: false,
    },
    verifiedModels: [],
  },
];

export type ProviderErrorKind = 'quota_exhausted' | 'rate_limited' | 'auth_error' | 'transient' | 'invalid_request';

export class ProviderExecutionError extends Error {
  kind: ProviderErrorKind;
  statusCode?: number;
  retryAfterMs?: number;
  providerId: AiProviderId;

  constructor(
    message: string,
    kind: ProviderErrorKind,
    providerId: AiProviderId,
    statusCode?: number,
    retryAfterMs?: number
  ) {
    super(message);
    this.kind = kind;
    this.providerId = providerId;
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}

interface CircuitBreakerState {
  failures: number;
  cooldownUntil: number;
  lastErrorKind?: ProviderErrorKind;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const inFlightCounts = new Map<string, number>();
const MAX_CONCURRENT_PER_PROVIDER = 6;

export function resetProviderCircuitBreakers(): void {
  circuitBreakers.clear();
  inFlightCounts.clear();
}

export function classifyProviderError(
  status: number | undefined,
  rawMessage: string,
  retryAfterHeader?: string | null
): { kind: ProviderErrorKind; retryAfterMs?: number } {
  const lower = rawMessage.toLowerCase();
  let retryAfterMs: number | undefined;
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) {
      retryAfterMs = Math.min(30000, Math.round(secs * 1000));
    }
  }

  if (
    status === 402 ||
    lower.includes('insufficient_quota') ||
    lower.includes('billing') ||
    lower.includes('credit balance') ||
    lower.includes('quota exceeded') ||
    lower.includes('exceeded your current quota')
  ) {
    return { kind: 'quota_exhausted' };
  }

  if (status === 401 || status === 403 || lower.includes('invalid api key') || lower.includes('unauthorized')) {
    return { kind: 'auth_error' };
  }

  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { kind: 'rate_limited', retryAfterMs: retryAfterMs || 1500 };
  }

  if (status && status >= 500) {
    return { kind: 'transient', retryAfterMs: retryAfterMs || 800 };
  }

  if (
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('aborted')
  ) {
    return { kind: 'transient', retryAfterMs: 700 };
  }

  return { kind: 'invalid_request' };
}

export function getProviderDefinition(providerId: AiProviderId): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((p) => p.providerId === providerId);
}

function mapKeyRow(row: Record<string, unknown>): AiProviderKeyRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    providerId: row.provider_id as AiProviderId,
    label: row.label as string,
    maskedPreview: row.masked_preview as string,
    isPrimary: Boolean(row.is_primary),
    isEnabled: Boolean(row.is_enabled),
    projectTag: (row.project_tag as string) || '',
    healthStatus: (row.health_status as AiProviderKeyRecord['healthStatus']) || 'untested',
    lastSuccessAt: (row.last_success_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listProvidersForUser(db: Database.Database, userId: string): AiProviderConfigRecord[] {
  const cfgRows = db
    .prepare('SELECT * FROM ai_provider_configs WHERE user_id = ?')
    .all(userId) as Array<Record<string, unknown>>;
  const cfgMap = new Map(cfgRows.map((r) => [r.provider_id as AiProviderId, r]));

  const keyRows = db
    .prepare('SELECT * FROM ai_provider_keys WHERE user_id = ? ORDER BY is_primary DESC, updated_at DESC')
    .all(userId) as Array<Record<string, unknown>>;

  const serverGeminiReady = Boolean(getGeminiApiKey());

  return PROVIDER_DEFINITIONS.map((def) => {
    const saved = cfgMap.get(def.providerId);
    const keys = keyRows
      .filter((k) => k.provider_id === def.providerId)
      .map(mapKeyRow);

    let discoveredModels: AiModelMetadata[] = def.verifiedModels;
    if (saved?.discovered_models_json) {
      try {
        const parsed = JSON.parse(saved.discovered_models_json as string) as AiModelMetadata[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          discoveredModels = parsed;
        }
      } catch {
        // fallback to verifiedModels
      }
    }

    let capabilities = def.capabilities;
    if (saved?.capabilities_json) {
      try {
        const parsed = JSON.parse(saved.capabilities_json as string) as Partial<AiModelCapability>;
        if (parsed && typeof parsed.text === 'boolean') {
          capabilities = { ...def.capabilities, ...parsed };
        }
      } catch {
        // fallback
      }
    }

    const cb = circuitBreakers.get(`${userId}:${def.providerId}`);
    let healthStatus = (saved?.health_status as AiProviderConfigRecord['healthStatus']) || 'untested';
    if (cb && cb.cooldownUntil > Date.now() && healthStatus !== 'quota_exhausted') {
      healthStatus = 'degraded';
    }

    return {
      providerId: def.providerId,
      displayName: (saved?.display_name as string) || def.displayName,
      protocol: def.protocol,
      defaultBaseUrl: def.defaultBaseUrl,
      baseUrl: (saved?.base_url as string) || def.defaultBaseUrl,
      requiresKey: def.requiresKey,
      supportsModelDiscovery: def.supportsModelDiscovery,
      defaultModel: (saved?.default_model as string) || def.defaultModel,
      backupProviderId: ((saved?.backup_provider_id as string) || '') as AiProviderId | '',
      isPrimary: Boolean(saved?.is_primary ?? (def.providerId === 'gemini' ? 1 : 0)),
      isEnabled: saved ? Boolean(saved.is_enabled) : true,
      discoveredModels,
      capabilities,
      healthStatus,
      lastError: (saved?.last_error as string | null) ?? null,
      lastTestedAt: (saved?.last_tested_at as string | null) ?? null,
      serverFallbackAvailable: def.providerId === 'gemini' ? serverGeminiReady : false,
      keys,
    };
  });
}

export function upsertProviderConfig(
  db: Database.Database,
  userId: string,
  providerId: AiProviderId,
  input: {
    baseUrl?: string;
    defaultModel?: string;
    backupProviderId?: AiProviderId | '';
    isPrimary?: boolean;
    isEnabled?: boolean;
    discoveredModels?: AiModelMetadata[];
    healthStatus?: AiProviderConfigRecord['healthStatus'];
    lastError?: string | null;
    lastTestedAt?: string | null;
  }
): AiProviderConfigRecord {
  const def = getProviderDefinition(providerId);
  if (!def) {
    throw new Error(`Unsupported AI provider "${providerId}".`);
  }

  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM ai_provider_configs WHERE user_id = ? AND provider_id = ?')
    .get(userId, providerId) as Record<string, unknown> | undefined;

  if (input.isPrimary) {
    db.prepare('UPDATE ai_provider_configs SET is_primary = 0 WHERE user_id = ?').run(userId);
  }

  const nextBaseUrl =
    input.baseUrl !== undefined ? String(input.baseUrl).trim() : (existing?.base_url as string) || def.defaultBaseUrl;
  const nextDefaultModel =
    input.defaultModel !== undefined
      ? String(input.defaultModel).trim()
      : (existing?.default_model as string) || def.defaultModel;
  const nextBackup =
    input.backupProviderId !== undefined
      ? input.backupProviderId === providerId
        ? ''
        : input.backupProviderId
      : ((existing?.backup_provider_id as AiProviderId | '') || '');
  const nextPrimary = input.isPrimary !== undefined ? (input.isPrimary ? 1 : 0) : Number(existing?.is_primary || 0);
  const nextEnabled =
    input.isEnabled !== undefined
      ? input.isEnabled
        ? 1
        : 0
      : existing
        ? Number(existing.is_enabled)
        : 1;
  const nextModelsJson = input.discoveredModels
    ? JSON.stringify(input.discoveredModels)
    : (existing?.discovered_models_json as string) || JSON.stringify(def.verifiedModels);
  const nextHealth = input.healthStatus ?? ((existing?.health_status as string) || 'untested');
  const nextLastError = input.lastError !== undefined ? input.lastError : ((existing?.last_error as string | null) ?? null);
  const nextTestedAt =
    input.lastTestedAt !== undefined ? input.lastTestedAt : ((existing?.last_tested_at as string | null) ?? null);

  if (existing) {
    db.prepare(
      `UPDATE ai_provider_configs
       SET base_url = ?, default_model = ?, backup_provider_id = ?, is_primary = ?, is_enabled = ?,
           discovered_models_json = ?, health_status = ?, last_error = ?, last_tested_at = ?, updated_at = ?
       WHERE user_id = ? AND provider_id = ?`
    ).run(
      nextBaseUrl,
      nextDefaultModel,
      nextBackup,
      nextPrimary,
      nextEnabled,
      nextModelsJson,
      nextHealth,
      nextLastError,
      nextTestedAt,
      now,
      userId,
      providerId
    );
  } else {
    db.prepare(
      `INSERT INTO ai_provider_configs
         (id, user_id, provider_id, display_name, base_url, default_model, backup_provider_id, is_primary, is_enabled,
          discovered_models_json, capabilities_json, health_status, last_error, last_tested_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `aicfg_${generateRandomToken(8)}`,
      userId,
      providerId,
      def.displayName,
      nextBaseUrl,
      nextDefaultModel,
      nextBackup,
      nextPrimary,
      nextEnabled,
      nextModelsJson,
      JSON.stringify(def.capabilities),
      nextHealth,
      nextLastError,
      nextTestedAt,
      now,
      now
    );
  }

  return listProvidersForUser(db, userId).find((p) => p.providerId === providerId)!;
}

export function addProviderKey(
  db: Database.Database,
  userId: string,
  providerId: AiProviderId,
  input: { label: string; apiKey: string; isPrimary?: boolean; projectTag?: string }
): AiProviderKeyRecord {
  if (!getProviderDefinition(providerId)) {
    throw new Error(`Unsupported AI provider "${providerId}".`);
  }
  const label = input.label.trim();
  const secret = input.apiKey.trim();
  if (label.length < 2) throw new Error('Key label must be at least 2 characters.');
  if (secret.length < 6) throw new Error('API key value is too short.');

  const encrypted = encryptCredentialPayload(secret);
  const masked = maskSecret(secret);
  const now = new Date().toISOString();
  const id = `aikey_${generateRandomToken(8)}`;

  const existingCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM ai_provider_keys WHERE user_id = ? AND provider_id = ?')
      .get(userId, providerId) as { cnt: number }
  ).cnt;

  const shouldBePrimary = Boolean(input.isPrimary) || existingCount === 0;
  if (shouldBePrimary) {
    db.prepare('UPDATE ai_provider_keys SET is_primary = 0 WHERE user_id = ? AND provider_id = ?').run(
      userId,
      providerId
    );
  }

  db.prepare(
    `INSERT INTO ai_provider_keys
       (id, user_id, provider_id, label, encrypted_payload, iv, auth_tag, masked_preview,
        is_primary, is_enabled, project_tag, health_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'untested', ?, ?)`
  ).run(
    id,
    userId,
    providerId,
    label,
    encrypted.encryptedPayload,
    encrypted.iv,
    encrypted.authTag,
    masked,
    shouldBePrimary ? 1 : 0,
    (input.projectTag || '').trim(),
    now,
    now
  );

  const row = db.prepare('SELECT * FROM ai_provider_keys WHERE id = ?').get(id) as Record<string, unknown>;
  return mapKeyRow(row);
}

export function updateProviderKey(
  db: Database.Database,
  userId: string,
  keyId: string,
  updates: { label?: string; isPrimary?: boolean; isEnabled?: boolean; projectTag?: string }
): AiProviderKeyRecord {
  const existing = db
    .prepare('SELECT * FROM ai_provider_keys WHERE id = ? AND user_id = ?')
    .get(keyId, userId) as Record<string, unknown> | undefined;
  if (!existing) {
    throw new Error('API key not found.');
  }

  const now = new Date().toISOString();
  if (updates.isPrimary) {
    db.prepare('UPDATE ai_provider_keys SET is_primary = 0 WHERE user_id = ? AND provider_id = ?').run(
      userId,
      existing.provider_id as string
    );
  }

  const label = updates.label !== undefined ? updates.label.trim() : (existing.label as string);
  if (label.length < 2) throw new Error('Key label must be at least 2 characters.');

  db.prepare(
    `UPDATE ai_provider_keys
     SET label = ?, is_primary = ?, is_enabled = ?, project_tag = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    label,
    updates.isPrimary !== undefined ? (updates.isPrimary ? 1 : 0) : Number(existing.is_primary),
    updates.isEnabled !== undefined ? (updates.isEnabled ? 1 : 0) : Number(existing.is_enabled),
    updates.projectTag !== undefined ? updates.projectTag.trim() : (existing.project_tag as string),
    now,
    keyId,
    userId
  );

  const row = db.prepare('SELECT * FROM ai_provider_keys WHERE id = ?').get(keyId) as Record<string, unknown>;
  return mapKeyRow(row);
}

export function deleteProviderKey(db: Database.Database, userId: string, keyId: string): boolean {
  const res = db.prepare('DELETE FROM ai_provider_keys WHERE id = ? AND user_id = ?').run(keyId, userId);
  return res.changes > 0;
}

export function resolveProviderApiKey(
  db: Database.Database,
  userId: string,
  providerId: AiProviderId,
  preferredKeyId?: string
): { apiKey: string | null; keyRecordId: string | null } {
  if (preferredKeyId) {
    const specific = db
      .prepare('SELECT * FROM ai_provider_keys WHERE id = ? AND user_id = ? AND provider_id = ? AND is_enabled = 1')
      .get(preferredKeyId, userId, providerId) as Record<string, unknown> | undefined;
    if (specific) {
      return {
        apiKey: decryptCredentialPayload(
          specific.encrypted_payload as string,
          specific.iv as string,
          specific.auth_tag as string
        ),
        keyRecordId: specific.id as string,
      };
    }
  }

  const primary = db
    .prepare(
      `SELECT * FROM ai_provider_keys
       WHERE user_id = ? AND provider_id = ? AND is_enabled = 1
       ORDER BY is_primary DESC, updated_at DESC LIMIT 1`
    )
    .get(userId, providerId) as Record<string, unknown> | undefined;

  if (primary) {
    return {
      apiKey: decryptCredentialPayload(
        primary.encrypted_payload as string,
        primary.iv as string,
        primary.auth_tag as string
      ),
      keyRecordId: primary.id as string,
    };
  }

  if (providerId === 'gemini') {
    return { apiKey: getGeminiApiKey(), keyRecordId: null };
  }

  return { apiKey: null, keyRecordId: null };
}

function recordKeyHealth(
  db: Database.Database,
  keyId: string | null,
  status: AiProviderKeyRecord['healthStatus'],
  errorMsg: string | null
) {
  if (!keyId) return;
  const now = new Date().toISOString();
  if (status === 'healthy') {
    db.prepare(
      `UPDATE ai_provider_keys
       SET health_status = 'healthy', last_success_at = ?, last_used_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`
    ).run(now, now, now, keyId);
  } else {
    db.prepare(
      `UPDATE ai_provider_keys
       SET health_status = ?, last_used_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(status, now, errorMsg, now, keyId);
  }
}

export async function discoverProviderModels(
  db: Database.Database,
  userId: string,
  providerId: AiProviderId
): Promise<AiModelMetadata[]> {
  const providers = listProvidersForUser(db, userId);
  const cfg = providers.find((p) => p.providerId === providerId);
  const def = getProviderDefinition(providerId);
  if (!cfg || !def) throw new Error('Provider not found.');

  const { apiKey } = resolveProviderApiKey(db, userId, providerId);
  const models: AiModelMetadata[] = [];

  if (providerId === 'gemini') {
    if (!apiKey) {
      throw new Error('Configure a Gemini API key first to query live Gemini models.');
    }
    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    const pager = await ai.models.list();
    for await (const m of pager) {
      const rawName = String(m.name || '').replace(/^models\//, '');
      if (!rawName || !rawName.includes('gemini')) continue;
      models.push({
        id: rawName,
        displayName: String(m.displayName || rawName),
        providerId: 'gemini',
        source: 'provider_api',
        capabilities: {
          text: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          vision: true,
          streaming: true,
          embeddings: false,
        },
      });
      if (models.length >= 25) break;
    }
  } else if (def.protocol === 'anthropic') {
    if (!apiKey) throw new Error('Add an Anthropic API key before discovering models.');
    const endpoint = `${(cfg.baseUrl || def.defaultBaseUrl).replace(/\/$/, '')}/models`;
    await assertSafeExternalUrl(endpoint);
    const resp = await safeFetch(endpoint, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10000),
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Anthropic model discovery failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as { data?: Array<{ id: string; display_name?: string }> };
    for (const item of json.data || []) {
      models.push({
        id: item.id,
        displayName: item.display_name || item.id,
        providerId: 'anthropic',
        source: 'provider_api',
        capabilities: def.capabilities,
      });
    }
  } else {
    const base = (cfg.baseUrl || def.defaultBaseUrl).replace(/\/$/, '');
    const endpoint = `${base}/models`;
    await assertSafeExternalUrl(endpoint);
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const resp = await safeFetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Model discovery failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as { data?: Array<{ id: string }> };
    for (const item of (json.data || []).slice(0, 40)) {
      models.push({
        id: item.id,
        displayName: item.id,
        providerId,
        source: 'provider_api',
        capabilities: def.capabilities,
      });
    }
  }

  const finalModels = models.length > 0 ? models : def.verifiedModels;
  upsertProviderConfig(db, userId, providerId, {
    discoveredModels: finalModels,
    healthStatus: 'healthy',
    lastError: null,
    lastTestedAt: new Date().toISOString(),
  });
  return finalModels;
}

export async function testProviderOrKey(
  db: Database.Database,
  userId: string,
  providerId: AiProviderId,
  keyId?: string
): Promise<{ ok: boolean; latencyMs: number; message: string; model: string }> {
  const started = Date.now();
  const cfg = listProvidersForUser(db, userId).find((p) => p.providerId === providerId);
  const def = getProviderDefinition(providerId);
  if (!cfg || !def) throw new Error('Provider not found.');

  const { apiKey, keyRecordId } = resolveProviderApiKey(db, userId, providerId, keyId);
  if (def.requiresKey && !apiKey) {
    throw new Error(`No enabled API key found for ${def.displayName}.`);
  }
  if (providerId === 'gemini' && !apiKey) {
    throw new Error('No Gemini API key configured in AI Providers or server environment.');
  }

  const model = cfg.defaultModel || def.defaultModel || 'gemini-3.8-flash';

  try {
    if (providerId === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: apiKey!, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
      const response = await ai.models.generateContent({
        model,
        contents: 'Respond with exactly OK.',
      });
      const reply = (response.text || 'OK').trim();
      recordKeyHealth(db, keyRecordId, 'healthy', null);
      upsertProviderConfig(db, userId, providerId, {
        healthStatus: 'healthy',
        lastError: null,
        lastTestedAt: new Date().toISOString(),
      });
      return { ok: true, latencyMs: Date.now() - started, message: `Connected (${reply})`, model };
    }

    if (def.protocol === 'anthropic') {
      const endpoint = `${(cfg.baseUrl || def.defaultBaseUrl).replace(/\/$/, '')}/messages`;
      await assertSafeExternalUrl(endpoint);
      const resp = await safeFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Respond with OK.' }],
        }),
        signal: AbortSignal.timeout(12000),
      });
      const text = await resp.text();
      if (!resp.ok) {
        const { kind } = classifyProviderError(resp.status, text, resp.headers.get('retry-after'));
        throw new ProviderExecutionError(
          `Anthropic error (${resp.status}): ${text.slice(0, 220)}`,
          kind,
          providerId,
          resp.status
        );
      }
      recordKeyHealth(db, keyRecordId, 'healthy', null);
      upsertProviderConfig(db, userId, providerId, {
        healthStatus: 'healthy',
        lastError: null,
        lastTestedAt: new Date().toISOString(),
      });
      return { ok: true, latencyMs: Date.now() - started, message: 'Anthropic key verified.', model };
    }

    const endpoint = `${(cfg.baseUrl || def.defaultBaseUrl).replace(/\/$/, '')}/chat/completions`;
    await assertSafeExternalUrl(endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const resp = await safeFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Respond with OK.' }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    const text = await resp.text();
    if (!resp.ok) {
      const { kind } = classifyProviderError(resp.status, text, resp.headers.get('retry-after'));
      throw new ProviderExecutionError(
        `${def.displayName} error (${resp.status}): ${text.slice(0, 220)}`,
        kind,
        providerId,
        resp.status
      );
    }
    recordKeyHealth(db, keyRecordId, 'healthy', null);
    upsertProviderConfig(db, userId, providerId, {
      healthStatus: 'healthy',
      lastError: null,
      lastTestedAt: new Date().toISOString(),
    });
    return { ok: true, latencyMs: Date.now() - started, message: `${def.displayName} verified.`, model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection test failed.';
    const kind =
      err instanceof ProviderExecutionError ? err.kind : classifyProviderError(undefined, msg).kind;
    const keyStatus: AiProviderKeyRecord['healthStatus'] =
      kind === 'quota_exhausted' ? 'quota_exhausted' : kind === 'auth_error' ? 'invalid' : 'degraded';
    recordKeyHealth(db, keyRecordId, keyStatus, msg);
    upsertProviderConfig(db, userId, providerId, {
      healthStatus: keyStatus,
      lastError: msg,
      lastTestedAt: new Date().toISOString(),
    });
    throw new Error(msg);
  }
}

export interface ResilientCallOptions<T> {
  db: Database.Database;
  userId: string;
  primaryProviderId: AiProviderId;
  requiredCapabilities: Array<keyof AiModelCapability>;
  preferredKeyId?: string;
  maxRetries?: number;
  runner: (providerCfg: AiProviderConfigRecord, apiKey: string | null) => Promise<T>;
}

/**
 * Executes a model request with:
 * - Concurrency guard
 * - Circuit breaker / cooldown checks
 * - Bounded Retry-After + exponential backoff with jitter for transient/rate spikes
 * - Strict quota compliance: NEVER rotates same-provider keys on quota exhaustion;
 *   only falls back to an explicit, enabled, capability-compatible backupProviderId.
 */
export async function executeWithProviderFailover<T>(opts: ResilientCallOptions<T>): Promise<{
  result: T;
  usedProviderId: AiProviderId;
  failoverUsed: boolean;
}> {
  const allProviders = listProvidersForUser(opts.db, opts.userId);
  const visited = new Set<AiProviderId>();
  let currentProviderId: AiProviderId | '' = opts.primaryProviderId;
  let lastErr: Error | null = null;
  let failoverUsed = false;

  while (currentProviderId && !visited.has(currentProviderId)) {
    visited.add(currentProviderId);
    const cfg = allProviders.find((p) => p.providerId === currentProviderId);
    if (!cfg || !cfg.isEnabled) {
      currentProviderId = cfg?.backupProviderId || '';
      failoverUsed = true;
      continue;
    }

    const supportsAll = opts.requiredCapabilities.every((cap) => cfg.capabilities[cap]);
    if (!supportsAll) {
      const missing = opts.requiredCapabilities.filter((cap) => !cfg.capabilities[cap]).join(', ');
      throw new ProviderExecutionError(
        `Provider "${cfg.displayName}" does not support required capabilities (${missing}).`,
        'invalid_request',
        cfg.providerId
      );
    }

    const cbKey = `${opts.userId}:${cfg.providerId}`;
    const cb = circuitBreakers.get(cbKey);
    if (cb && cb.cooldownUntil > Date.now()) {
      if (cfg.backupProviderId && !visited.has(cfg.backupProviderId)) {
        currentProviderId = cfg.backupProviderId;
        failoverUsed = true;
        continue;
      }
      throw new ProviderExecutionError(
        `Provider "${cfg.displayName}" is in cooldown after recent failures. Try again shortly or configure a backup provider.`,
        cb.lastErrorKind || 'transient',
        cfg.providerId
      );
    }

    const inflight = inFlightCounts.get(cbKey) || 0;
    if (inflight >= MAX_CONCURRENT_PER_PROVIDER) {
      throw new ProviderExecutionError(
        `Concurrency limit reached for "${cfg.displayName}" (${MAX_CONCURRENT_PER_PROVIDER} active requests).`,
        'rate_limited',
        cfg.providerId
      );
    }

    const { apiKey, keyRecordId } = resolveProviderApiKey(
      opts.db,
      opts.userId,
      cfg.providerId,
      cfg.providerId === opts.primaryProviderId ? opts.preferredKeyId : undefined
    );

    const maxRetries = Math.min(2, opts.maxRetries ?? 1);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      inFlightCounts.set(cbKey, (inFlightCounts.get(cbKey) || 0) + 1);
      try {
        const result = await opts.runner(cfg, apiKey);
        circuitBreakers.delete(cbKey);
        recordKeyHealth(opts.db, keyRecordId, 'healthy', null);
        return { result, usedProviderId: cfg.providerId, failoverUsed };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const execErr =
          err instanceof ProviderExecutionError
            ? err
            : new ProviderExecutionError(
                msg,
                classifyProviderError(undefined, msg).kind,
                cfg.providerId,
                undefined,
                classifyProviderError(undefined, msg).retryAfterMs
              );
        lastErr = execErr;

        if (execErr.kind === 'quota_exhausted') {
          // NEVER cycle same-project keys or blindly retry quota errors
          recordKeyHealth(opts.db, keyRecordId, 'quota_exhausted', execErr.message);
          upsertProviderConfig(opts.db, opts.userId, cfg.providerId, {
            healthStatus: 'quota_exhausted',
            lastError: execErr.message,
            lastTestedAt: new Date().toISOString(),
          });
          circuitBreakers.set(cbKey, {
            failures: 3,
            cooldownUntil: Date.now() + 60_000,
            lastErrorKind: 'quota_exhausted',
          });
          break;
        }

        if (execErr.kind === 'auth_error' || execErr.kind === 'invalid_request') {
          if (execErr.kind === 'auth_error') {
            recordKeyHealth(opts.db, keyRecordId, 'invalid', execErr.message);
          }
          break;
        }

        if (attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 250);
          const delayMs = execErr.retryAfterMs || Math.min(4000, 400 * Math.pow(2, attempt)) + jitter;
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          const prev = circuitBreakers.get(cbKey)?.failures || 0;
          const nextFailures = prev + 1;
          circuitBreakers.set(cbKey, {
            failures: nextFailures,
            cooldownUntil: nextFailures >= 2 ? Date.now() + 30_000 : 0,
            lastErrorKind: execErr.kind,
          });
          recordKeyHealth(opts.db, keyRecordId, 'degraded', execErr.message);
        }
      } finally {
        const cur = inFlightCounts.get(cbKey) || 1;
        inFlightCounts.set(cbKey, Math.max(0, cur - 1));
      }
    }

    if (cfg.backupProviderId && !visited.has(cfg.backupProviderId)) {
      currentProviderId = cfg.backupProviderId;
      failoverUsed = true;
    } else {
      currentProviderId = '';
    }
  }

  throw lastErr || new Error('All configured AI providers failed.');
}
