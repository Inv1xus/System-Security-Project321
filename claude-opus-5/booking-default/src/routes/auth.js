import { Router } from 'express';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, requireUser
} from '../auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function authRoutes(db) {
  const router = Router();

  router.post('/signup', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    const info = db.prepare(
      'INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)'
    ).run(email, hashPassword(password), 'user', new Date().toISOString());

    const userId = Number(info.lastInsertRowid);
    setSessionCookie(res, createSession(db, userId));
    res.status(201).json({ user: { id: userId, email, role: 'user' } });
  });

  router.post('/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    const user = db.prepare('SELECT id, email, role, password_hash FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }

    setSessionCookie(res, createSession(db, user.id));
    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  });

  router.post('/logout', (req, res) => {
    destroySession(db, req.sessionToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireUser, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
