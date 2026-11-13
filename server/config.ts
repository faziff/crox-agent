import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.cwd(), 'data');

function ensureDataDir(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function resolveDevKey(filename: string): string {
  ensureDataDir();
  const keyPath = path.join(dataDir, filename);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, generated, { mode: 0o600 });
  return generated;
}

export function getCredentialEncryptionKey(): { keyHex: string; source: 'env' | 'dev-file' } | null {
  const envKey = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (envKey && envKey !== 'replace-with-a-32-byte-encryption-secret') {
    const derived = crypto.createHash('sha256').update(envKey).digest('hex');
    return { keyHex: derived, source: 'env' };
  }
  if (isProd) {
    return null;
  }
  return { keyHex: resolveDevKey('.dev-credential-key'), source: 'dev-file' };
}

export function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret !== 'replace-with-a-long-random-secret-in-production') {
    return envSecret;
  }
  if (isProd) {
    return crypto.randomBytes(32).toString('hex');
  }
  return resolveDevKey('.dev-session-key');
}

export function getGeminiApiKey(): string {
  const raw = process.env.GEMINI_API_KEY?.trim();
  if (!raw || raw === 'MY_GEMINI_API_KEY') {
    return '';
  }
  return raw;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  isProd,
  dbPath: process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : path.join(dataDir, 'crox.db'),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  get geminiApiKey(): string {
    return getGeminiApiKey();
  },
  smtp: {
    host: process.env.SMTP_HOST?.trim() || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS?.trim() || '',
    from: process.env.SMTP_FROM?.trim() || 'noreply@crox.local',
  },
  execution: {
    defaultTimeoutMs: 15000,
    maxWorkflowTimeoutMs: 60000,
    maxWebhookPayloadBytes: 512 * 1024,
  },
};
