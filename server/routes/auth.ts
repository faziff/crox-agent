import { Router, Response } from 'express';
import nodemailer from 'nodemailer';
import { config } from '../config.ts';
import { getDb } from '../db/database.ts';
import {
  AuthenticatedRequest,
  extractSessionToken,
  mapUserRow,
  requireAuth,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.ts';
import { ensureDefaultProject } from '../services/projectService.ts';
import { installTemplateForUser } from '../services/templateService.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { generateRandomToken, hashPassword, hashToken, verifyPassword } from '../utils/crypto.ts';

const router = Router();

// Authentication endpoints are common brute-force and abuse targets.
// Limits are intentionally per endpoint and per client IP.
const registerRateLimit = createRateLimiter({
  name: 'auth-register',
  limit: 5,
  windowMs: 60 * 60 * 1000,
  message: 'Too many registration attempts. Please try again in an hour.',
});
const loginRateLimit = createRateLimiter({
  name: 'auth-login',
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});
const demoRateLimit = createRateLimiter({
  name: 'auth-demo',
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: 'The demo workspace is temporarily rate-limited. Please try again later.',
});
const passwordRecoveryRateLimit = createRateLimiter({
  name: 'auth-password-recovery',
  limit: 5,
  windowMs: 15 * 60 * 1000,
  message: 'Too many password recovery attempts. Please try again in 15 minutes.',
});

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function setSessionCookie(req: AuthenticatedRequest, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim() === 'https';

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_DURATION_MS,
  });
}

function createSessionForUser(req: AuthenticatedRequest, res: Response, userId: string): string {
  const db = getDb();
  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const sessionId = `sess_${generateRandomToken(8)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    userId,
    tokenHash,
    String(req.headers['user-agent'] || '').slice(0, 200),
    String(req.ip || req.socket.remoteAddress || '').slice(0, 64),
    expiresAt,
    now.toISOString()
  );

  setSessionCookie(req, res, rawToken);
  return rawToken;
}

router.post('/register', registerRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!fullName || fullName.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = `usr_${generateRandomToken(8)}`;
    const passwordHash = await hashPassword(password);
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, timezone, theme, notifications_enabled, plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'UTC', 'dark', 1, 'free', ?, ?)`
    ).run(userId, fullName, email, passwordHash, nowIso, nowIso);

    ensureDefaultProject(db, userId);

    // Give new signups a working starter workflow ready to explore and run
    installTemplateForUser(db, 'tpl_welcome_email', userId);

    const token = createSessionForUser(req, res, userId);

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
    res.status(201).json({ user: mapUserRow(userRow), token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to register user.' });
  }
});

router.post('/login', loginRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = getDb();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | (Record<string, unknown> & { id: string; password_hash: string })
      | undefined;

    if (!userRow) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await verifyPassword(password, userRow.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    ensureDefaultProject(db, userRow.id);
    const token = createSessionForUser(req, res, userRow.id);
    res.json({ user: mapUserRow(userRow), token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed.' });
  }
});

router.post('/demo', demoRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const demoEmail = 'demo@crox.app';
    let userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(demoEmail) as
      | (Record<string, unknown> & { id: string })
      | undefined;

    if (!userRow) {
      const userId = `usr_demo_${generateRandomToken(4)}`;
      const passwordHash = await hashPassword(generateRandomToken(16));
      const nowIso = new Date().toISOString();

      db.prepare(
        `INSERT INTO users (id, full_name, email, password_hash, timezone, theme, notifications_enabled, plan, created_at, updated_at)
         VALUES (?, 'Demo Workspace', ?, ?, 'UTC', 'dark', 1, 'pro', ?, ?)`
      ).run(userId, demoEmail, passwordHash, nowIso, nowIso);

      ensureDefaultProject(db, userId);
      installTemplateForUser(db, 'tpl_ai_research_agent', userId);
      installTemplateForUser(db, 'tpl_welcome_email', userId);
      installTemplateForUser(db, 'tpl_daily_ai_summary', userId);
      installTemplateForUser(db, 'tpl_webhook_notification', userId);

      userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> & { id: string };
    } else {
      db.prepare("UPDATE users SET theme = 'dark' WHERE id = ?").run(userRow.id);
      userRow.theme = 'dark';
      ensureDefaultProject(db, userRow.id);
      const wfCount = db.prepare('SELECT COUNT(*) as cnt FROM workflows WHERE user_id = ?').get(userRow.id) as {
        cnt: number;
      };
      if (wfCount.cnt === 0) {
        installTemplateForUser(db, 'tpl_ai_research_agent', userRow.id);
        installTemplateForUser(db, 'tpl_welcome_email', userRow.id);
        installTemplateForUser(db, 'tpl_daily_ai_summary', userRow.id);
      }
    }

    const token = createSessionForUser(req, res, userRow.id);
    res.json({ user: mapUserRow(userRow), token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to start demo workspace.' });
  }
});

router.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  const token = extractSessionToken(req);
  if (token) {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

router.post('/forgot-password', passwordRecoveryRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const emailConfigured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
    if (!emailConfigured) {
      res.status(503).json({
        emailConfigured: false,
        error:
          'Password reset email delivery is not configured on this server (missing SMTP_HOST, SMTP_USER, or SMTP_PASS environment variables). Contact your administrator or configure SMTP in .env.',
      });
      return;
    }

    const db = getDb();
    const user = db.prepare('SELECT id, full_name, email FROM users WHERE email = ?').get(email) as
      | { id: string; full_name: string; email: string }
      | undefined;

    if (user) {
      const rawToken = generateRandomToken(24);
      const tokenHash = hashToken(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

      db.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(`rst_${generateRandomToken(8)}`, user.id, tokenHash, expiresAt, now.toISOString());

      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });

      const resetLink = `${config.appUrl}/?reset_token=${rawToken}`;
      await transporter.sendMail({
        from: config.smtp.from,
        to: user.email,
        subject: 'CROX Password Recovery',
        text: `Hello ${user.full_name},\n\nUse this token or link within 30 minutes to reset your CROX password:\n${resetLink}\n\nReset token: ${rawToken}`,
      });
    }

    res.json({
      ok: true,
      emailConfigured: true,
      message: 'If an account exists for that email, a password recovery link has been dispatched.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to process password recovery.' });
  }
});

router.post('/reset-password', passwordRecoveryRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!token) {
      res.status(400).json({ error: 'Reset token is required.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const db = getDb();
    const tokenHash = hashToken(token);
    const nowIso = new Date().toISOString();
    const record = db
      .prepare(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
      )
      .get(tokenHash, nowIso) as { id: string; user_id: string } | undefined;

    if (!record) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }

    const newHash = await hashPassword(password);
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, nowIso, record.user_id);
      db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(nowIso, record.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(record.user_id);
    });
    tx();

    res.json({ ok: true, message: 'Password updated. Please log in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
  }
});

export default router;
