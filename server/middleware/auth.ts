import { NextFunction, Request, Response } from 'express';
import { getDb } from '../db/database.ts';
import { hashToken } from '../utils/crypto.ts';
import { UserProfile } from '../../src/types/workflow.ts';

export const SESSION_COOKIE_NAME = 'crox_session';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  sessionId?: string;
}

export function extractSessionToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  return cookieToken?.trim() || undefined;
}

export function mapUserRow(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    timezone: (row.timezone as string) || 'UTC',
    theme: row.theme === 'light' ? 'light' : 'dark',
    notificationsEnabled: Boolean(row.notifications_enabled),
    plan: row.plan === 'pro' ? 'pro' : 'free',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const db = getDb();
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT u.*, s.id as session_id, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, nowIso) as (Record<string, unknown> & { session_id: string }) | undefined;

  if (!row) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }

  req.user = mapUserRow(row);
  req.sessionId = row.session_id;
  next();
}
