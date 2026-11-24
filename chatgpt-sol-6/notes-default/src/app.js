import express from 'express';
import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDatabase } from './db.js';

const scrypt = promisify(scryptCallback);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'notes_session';
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getCookie(req) {
  const part = (req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(`${COOKIE_NAME}=`));
  const token = part?.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

function setSessionCookie(res, token, secure) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: SESSION_MS
  });
}

function clearSessionCookie(res, secure) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure, path: '/' });
}

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function noteInput(body) {
  if (!body || typeof body.title !== 'string' || typeof body.body !== 'string') return null;
  const title = body.title.trim();
  if (!title || title.length > 120 || body.body.length > 20000) return null;
  return { title, body: body.body };
}

export function createApp({ databasePath = './data/notes.sqlite', cookieSecure = false } = {}) {
  const db = openDatabase(databasePath);
  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // The browser sends JSON for every write. This also rules out cross-site form posts.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Send JSON requests.' });
    }
    next();
  });

  function sessionUser(req) {
    const token = getCookie(req);
    if (!token) return null;
    return db.prepare(`
      SELECT users.id, users.email FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash(token), Date.now()) || null;
  }

  function requireUser(req, res, next) {
    req.user = sessionUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please log in.' });
    next();
  }

  function createSession(req, res, user) {
    const oldToken = getCookie(req);
    if (oldToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(oldToken));
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash(token), user.id, Date.now() + SESSION_MS);
    setSessionCookie(res, token, cookieSecure);
  }

  app.post('/api/auth/signup', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
    const password = req.body?.password;
    if (!validEmail(email) || !validPassword(password)) {
      return res.status(400).json({ error: 'Enter a valid email and a password of 8–128 characters.' });
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const passwordHash = await hashPassword(password);
    try {
      const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
        .run(email, passwordHash);
      const user = { id: Number(result.lastInsertRowid), email };
      createSession(req, res, user);
      return res.status(201).json({ user });
    } catch (error) {
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw error;
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const record = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
    if (!record || !(await verifyPassword(password, record.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = { id: record.id, email: record.email };
    createSession(req, res, user);
    return res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = getCookie(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    clearSessionCookie(res, cookieSecure);
    res.status(204).end();
  });

  app.get('/api/auth/me', (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in.' });
    res.json({ user });
  });

  app.get('/api/notes', requireUser, (req, res) => {
    const notes = db.prepare(`
      SELECT id, title, body, created_at, updated_at FROM notes
      WHERE user_id = ? ORDER BY updated_at DESC, id DESC
    `).all(req.user.id);
    res.json({ notes });
  });

  app.get('/api/notes/:id', requireUser, (req, res) => {
    const note = db.prepare(`
      SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    res.json({ note });
  });

  app.post('/api/notes', requireUser, (req, res) => {
    const input = noteInput(req.body);
    if (!input) return res.status(400).json({ error: 'Title must be 1–120 characters; note must be at most 20,000 characters.' });
    const result = db.prepare('INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)')
      .run(req.user.id, input.title, input.body);
    const note = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json({ note });
  });

  app.put('/api/notes/:id', requireUser, (req, res) => {
    const input = noteInput(req.body);
    if (!input) return res.status(400).json({ error: 'Title must be 1–120 characters; note must be at most 20,000 characters.' });
    const result = db.prepare(`
      UPDATE notes SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(input.title, input.body, req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Note not found.' });
    const note = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?')
      .get(req.params.id);
    res.json({ note });
  });

  app.delete('/api/notes/:id', requireUser, (req, res) => {
    const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Note not found.' });
    res.status(204).end();
  });

  app.use(express.static(publicDir));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
