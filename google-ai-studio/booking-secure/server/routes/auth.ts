import { Router } from 'express';
import { z } from 'zod';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  revokeSession,
  setSessionCookie,
  verifyPassword,
} from '../auth.ts';
import { db, hasAnyAdmin } from '../db.ts';
import type { AuthenticatedRequest, UserRole } from '../middleware.ts';

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80, 'Name is too long.'),
  email: z.string().trim().email('Please enter a valid email address.').max(160),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be 72 characters or fewer.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(160),
  password: z.string().min(1, 'Password is required.').max(72),
});

router.get('/me', (req: AuthenticatedRequest, res) => {
  res.json({
    user: req.authUser ?? null,
    needsAdminSetup: !hasAnyAdmin(),
  });
});

router.post('/signup', async (req: AuthenticatedRequest, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const result = db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')")
      .run(name, email, passwordHash);

    const userId = Number(result.lastInsertRowid);
    const user = db
      .prepare('SELECT id, name, email, role, created_at AS createdAt FROM users WHERE id = ?')
      .get(userId) as { id: number; name: string; email: string; role: UserRole; createdAt: string };

    const token = createSession(user.id);
    setSessionCookie(req, res, token);

    res.status(201).json({ user });
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    throw err;
  }
});

router.post('/login', async (req: AuthenticatedRequest, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid credentials.' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const row = db
    .prepare(
      'SELECT id, name, email, password_hash, role, created_at AS createdAt FROM users WHERE email = ?'
    )
    .get(email) as
    | {
        id: number;
        name: string;
        email: string;
        password_hash: string;
        role: UserRole;
        createdAt: string;
      }
    | undefined;

  const isValid = await verifyPassword(parsed.data.password, row?.password_hash ?? null);
  if (!row || !isValid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (req.sessionId) {
    revokeSession(req.sessionId);
  }

  const token = createSession(row.id);
  setSessionCookie(req, res, token);

  res.json({
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
    },
  });
});

router.post('/logout', (req: AuthenticatedRequest, res) => {
  if (req.sessionId) {
    revokeSession(req.sessionId);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// One-time bootstrap endpoint enabled strictly when 0 admin users exist in the database
router.post('/setup-admin', async (req: AuthenticatedRequest, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  const createInitialAdmin = db.transaction(() => {
    const existingAdmin = db
      .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
      .get() as { id: number } | undefined;

    if (existingAdmin) {
      return { status: 403 as const, error: 'An administrator account already exists.' };
    }

    const existingEmail = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id: number } | undefined;

    if (existingEmail) {
      return { status: 409 as const, error: 'An account with this email already exists.' };
    }

    const insert = db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(name, email, passwordHash);

    const user = db
      .prepare('SELECT id, name, email, role, created_at AS createdAt FROM users WHERE id = ?')
      .get(Number(insert.lastInsertRowid)) as {
      id: number;
      name: string;
      email: string;
      role: UserRole;
      createdAt: string;
    };

    return { status: 201 as const, user };
  }).immediate;

  const outcome = createInitialAdmin();
  if ('error' in outcome) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  if (req.sessionId) {
    revokeSession(req.sessionId);
  }

  const token = createSession(outcome.user.id);
  setSessionCookie(req, res, token);
  res.status(201).json({ user: outcome.user });
});

export default router;
