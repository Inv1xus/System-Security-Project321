const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { openDatabase } = require('./db');
const { hashPassword, verifyPassword, token, tokenHash, equalToken } = require('./security');

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LIMIT = 10;

function createApp(db, options = {}) {
  const app = express();
  let lastLimitCleanup = 0;
  const secureCookies = options.secureCookies ?? (process.env.NODE_ENV === 'production');
  if (options.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.set('json escape', true);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin'
    });
    if (secureCookies && req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '64kb', type: 'application/json' }));

  function sameOrigin(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const expected = `${req.protocol}://${req.get('host')}`;
    if (origin !== expected) return res.status(403).json({ error: 'Invalid request origin' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
    next();
  }
  app.use('/api', sameOrigin);

  function rateLimit(req, res, next) {
    const now = Date.now();
    if (now - lastLimitCleanup > AUTH_WINDOW_MS) {
      db.prepare('DELETE FROM auth_limits WHERE resets_at <= ?').run(now);
      lastLimitCleanup = now;
    }
    const key = crypto.createHash('sha256').update(req.ip).digest('hex');
    const row = db.prepare(`
      INSERT INTO auth_limits(ip, attempts, resets_at) VALUES (?, 1, ?)
      ON CONFLICT(ip) DO UPDATE SET
        attempts = CASE WHEN resets_at <= ? THEN 1 ELSE attempts + 1 END,
        resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
      RETURNING attempts, resets_at
    `).get(key, now + AUTH_WINDOW_MS, now, now);
    if (row.attempts > AUTH_LIMIT) {
      res.set('Retry-After', String(Math.ceil((row.resets_at - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    next();
  }

  function sessionFromRequest(req) {
    const cookie = (req.get('cookie') || '').split(';').map(s => s.trim())
      .find(s => s.startsWith('session='));
    const value = cookie?.slice(8);
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
    return db.prepare(`
      SELECT s.token_hash, s.csrf_token, u.id AS user_id, u.email
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash(value), Date.now()) || null;
  }

  function requireAuth(req, res, next) {
    req.session = sessionFromRequest(req);
    if (!req.session) return res.status(401).json({ error: 'Log in to continue' });
    next();
  }

  function requireCsrf(req, res, next) {
    if (!equalToken(req.get('x-csrf-token'), req.session.csrf_token)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next();
  }

  function setSession(res, userId) {
    const value = token();
    const csrf = token();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash(value), userId, csrf, Date.now() + SESSION_MS);
    res.cookie('session', value, {
      httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/', maxAge: SESSION_MS
    });
    return csrf;
  }

  function credentials(body) {
    const email = body?.email;
    const password = body?.password;
    if (typeof email !== 'string' || typeof password !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
    if (password.length < 12 || password.length > 128) return null;
    return { email: normalized, password };
  }

  app.post('/api/signup', rateLimit, async (req, res, next) => {
    try {
      const input = credentials(req.body);
      if (!input) return res.status(400).json({ error: 'Use a valid email and a password of 12 to 128 characters' });
      const hash = await hashPassword(input.password);
      let userId;
      try {
        userId = db.prepare('INSERT INTO users(email, password_hash) VALUES (?, ?)')
          .run(input.email, hash).lastInsertRowid;
      } catch (error) {
        if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(error.message)) {
          return res.status(409).json({ error: 'Unable to create account' });
        }
        throw error;
      }
      const csrfToken = setSession(res, userId);
      res.status(201).json({ user: { email: input.email }, csrfToken });
    } catch (error) { next(error); }
  });

  app.post('/api/login', rateLimit, async (req, res, next) => {
    try {
      const input = credentials(req.body);
      if (!input) return res.status(400).json({ error: 'Invalid email or password' });
      const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
        .get(input.email);
      const valid = await verifyPassword(input.password, user?.password_hash);
      if (!valid || !user) return res.status(401).json({ error: 'Invalid email or password' });
      const csrfToken = setSession(res, user.id);
      res.json({ user: { email: user.email }, csrfToken });
    } catch (error) { next(error); }
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: { email: req.session.email }, csrfToken: req.session.csrf_token });
  });

  app.post('/api/logout', requireAuth, requireCsrf, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.session.token_hash);
    res.clearCookie('session', { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/' });
    res.status(204).end();
  });

  function validNote(body) {
    if (typeof body?.title !== 'string' || typeof body?.body !== 'string') return null;
    const title = body.title.trim();
    if (!title || title.length > 200 || body.body.length > 50000) return null;
    return { title, body: body.body };
  }

  function noteId(req, res, next) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: 'Note not found' });
    req.noteId = id;
    next();
  }

  app.get('/api/notes', requireAuth, (req, res) => {
    const notes = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC')
      .all(req.session.user_id);
    res.json({ notes });
  });

  app.post('/api/notes', requireAuth, requireCsrf, (req, res) => {
    const note = validNote(req.body);
    if (!note) return res.status(400).json({ error: 'Title is required (max 200 characters); body max 50,000 characters' });
    const id = db.prepare('INSERT INTO notes(user_id, title, body) VALUES (?, ?, ?)')
      .run(req.session.user_id, note.title, note.body).lastInsertRowid;
    const created = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?').get(id);
    res.status(201).json({ note: created });
  });

  app.get('/api/notes/:id', requireAuth, noteId, (req, res) => {
    const note = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?')
      .get(req.noteId, req.session.user_id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ note });
  });

  app.put('/api/notes/:id', requireAuth, requireCsrf, noteId, (req, res) => {
    const note = validNote(req.body);
    if (!note) return res.status(400).json({ error: 'Title is required (max 200 characters); body max 50,000 characters' });
    const result = db.prepare("UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(note.title, note.body, req.noteId, req.session.user_id);
    if (!result.changes) return res.status(404).json({ error: 'Note not found' });
    const updated = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?').get(req.noteId);
    res.json({ note: updated });
  });

  app.delete('/api/notes/:id', requireAuth, requireCsrf, noteId, (req, res) => {
    const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
      .run(req.noteId, req.session.user_id);
    if (!result.changes) return res.status(404).json({ error: 'Note not found' });
    res.status(204).end();
  });

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', etag: false, maxAge: 0 }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Invalid JSON' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

if (require.main === module) {
  process.umask(0o077);
  const db = openDatabase(path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'notes.db'));
  const app = createApp(db, {
    secureCookies: process.env.COOKIE_SECURE === undefined
      ? process.env.NODE_ENV === 'production' : process.env.COOKIE_SECURE === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true'
  });
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '0.0.0.0', () => console.log(`Listening on port ${port}`));
  function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createApp };
