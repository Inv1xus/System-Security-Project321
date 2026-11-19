// Sign-up, log-in, log-out and "who am I" endpoints.
import express from 'express';
import { db } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
} from '../auth.js';

export const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

function validateCredentials(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username)) {
    return { error: 'Username must be 3-32 characters: letters, digits, dot, dash or underscore.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.` };
  }
  return { username, password };
}

router.post('/signup', (req, res) => {
  const parsed = validateCredentials(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const existing = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(parsed.username);
  if (existing) return res.status(409).json({ error: 'That username is already taken.' });

  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(parsed.username, hashPassword(parsed.password));

  const userId = Number(info.lastInsertRowid);
  createSession(res, userId);
  res.status(201).json({ user: { id: userId, username: parsed.username } });
});

router.post('/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const user = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username);

  // Same message either way, so the response does not reveal which usernames exist.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  createSession(res, user.id);
  res.json({ user: { id: user.id, username: user.username } });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});
