import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createSession,
  deleteSessionByHash,
  getSessionCookieOptions,
  hashPassword,
  runDummyPasswordCheck,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from '../auth.ts';
import { db } from '../db.ts';
import { requireAuth, requireCsrf, type AuthenticatedRequest } from '../middleware.ts';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in a few minutes.' },
});

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(32, 'Username must be 32 characters or fewer.')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username may only contain letters, numbers, hyphens, and underscores.'
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required.').max(64),
  password: z.string().min(1, 'Password is required.').max(128),
});

function setSessionCookie(req: AuthenticatedRequest, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req));
}

authRouter.post('/signup', authLimiter, async (req: AuthenticatedRequest, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid signup details.';
    res.status(400).json({ error: firstIssue });
    return;
  }

  const normalizedUsername = parsed.data.username.toLowerCase();
  const { password } = parsed.data;

  try {
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(normalizedUsername) as { id: string } | undefined;

    if (existing) {
      res.status(409).json({ error: 'That username is already taken.' });
      return;
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = Date.now();

    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).run(userId, normalizedUsername, passwordHash, now);

    const { sessionToken, csrfToken } = createSession(userId);
    setSessionCookie(req, res, sessionToken);

    res.status(201).json({
      user: { id: userId, username: normalizedUsername },
      csrfToken,
    });
  } catch (err: unknown) {
    const sqliteErr = err as { code?: string };
    if (sqliteErr?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'That username is already taken.' });
      return;
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

authRouter.post('/login', authLimiter, async (req: AuthenticatedRequest, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter both username and password.' });
    return;
  }

  const normalizedUsername = parsed.data.username.toLowerCase();
  const { password } = parsed.data;

  try {
    const user = db
      .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
      .get(normalizedUsername) as
      | { id: string; username: string; password_hash: string }
      | undefined;

    if (!user) {
      await runDummyPasswordCheck(password);
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const { sessionToken, csrfToken } = createSession(user.id);
    setSessionCookie(req, res, sessionToken);

    res.json({
      user: { id: user.id, username: user.username },
      csrfToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Unable to log in right now.' });
  }
});

authRouter.post('/logout', requireAuth, requireCsrf, (req: AuthenticatedRequest, res) => {
  if (req.auth) {
    deleteSessionByHash(req.auth.tokenHash);
  }
  const cookieOpts = getSessionCookieOptions(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
  });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    user: req.auth!.user,
    csrfToken: req.auth!.csrfToken,
  });
});
