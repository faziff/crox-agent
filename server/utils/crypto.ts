import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getCredentialEncryptionKey } from '../config.ts';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function encryptCredentialPayload(plaintext: string): {
  encryptedPayload: string;
  iv: string;
  authTag: string;
} {
  const keyInfo = getCredentialEncryptionKey();
  if (!keyInfo) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY is not configured. Set a secure encryption secret in environment configuration before saving credentials.'
    );
  }
  const key = Buffer.from(keyInfo.keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptCredentialPayload(encryptedPayload: string, ivBase64: string, authTagBase64: string): string {
  const keyInfo = getCredentialEncryptionKey();
  if (!keyInfo) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured. Unable to decrypt credential.');
  }
  const key = Buffer.from(keyInfo.keyHex, 'hex');
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPayload, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return '••••••••';
  if (trimmed.length <= 6) {
    return '••••' + trimmed.slice(-1);
  }
  if (trimmed.length <= 12) {
    return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
