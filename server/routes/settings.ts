import { Router, Response } from 'express';
import { getDb } from '../db/database.ts';
import {
  AuthenticatedRequest,
  mapUserRow,
  requireAuth,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.ts';
import { hashPassword, verifyPassword } from '../utils/crypto.ts';
import { UserSessionInfo } from '../../src/types/workflow.ts';

const router = Router();
router.use(requireAuth);

router.put('/profile', (req: AuthenticatedRequest, res: Response) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!fullName || fullName.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const db = getDb();
    const existingEmail = db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email, req.user!.id);
    if (existingEmail) {
      res.status(409).json({ error: 'That email address is already used by another account.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET full_name = ?, email = ?, updated_at = ? WHERE id = ?').run(
      fullName,
      email,
      now,
      req.user!.id
    );

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
    res.json({ user: mapUserRow(row) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update profile.' });
  }
});

router.put('/preferences', (req: AuthenticatedRequest, res: Response) => {
  try {
    const timezone = String(req.body?.timezone || req.user!.timezone || 'UTC').trim();
    const theme = req.body?.theme === 'dark' ? 'dark' : 'light';
    const notificationsEnabled = req.body?.notificationsEnabled !== false ? 1 : 0;
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(
      'UPDATE users SET timezone = ?, theme = ?, notifications_enabled = ?, updated_at = ? WHERE id = ?'
    ).run(timezone, theme, notificationsEnabled, now, req.user!.id);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
    res.json({ user: mapUserRow(row) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update preferences.' });
  }
});

router.put('/password', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new passwords are required.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New passwords do not match.' });
      return;
    }

    const db = getDb();
    const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
      | { password_hash: string }
      | undefined;

    if (!userRow || !(await verifyPassword(currentPassword, userRow.password_hash))) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      nextHash,
      new Date().toISOString(),
      req.user!.id
    );

    res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to change password.' });
  }
});

router.get('/sessions', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, user_agent, ip_address, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC'
    )
    .all(req.user!.id, new Date().toISOString()) as Array<{
    id: string;
    user_agent: string;
    ip_address: string;
    created_at: string;
    expires_at: string;
  }>;

  const sessions: UserSessionInfo[] = rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent || 'Browser Session',
    ipAddress: r.ip_address || 'Unknown',
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    isCurrent: r.id === req.sessionId,
  }));

  res.json({ sessions });
});

router.delete('/sessions/:sessionId', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
    .run(req.params.sessionId, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/account', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const password = String(req.body?.password || '');
    if (!password) {
      res.status(400).json({ error: 'Please confirm your password to delete your account.' });
      return;
    }

    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
      | { password_hash: string }
      | undefined;

    if (!row || !(await verifyPassword(password, row.password_hash))) {
      res.status(401).json({ error: 'Password verification failed.' });
      return;
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.user!.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Account deletion failed.' });
  }
});

export default router;
