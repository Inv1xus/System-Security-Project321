import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDatabase } from './db.js';
import { hashPassword, verifyPassword, token, tokenHash, parseCookies } from './security.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function fail(res, status, message) { return res.status(status).json({ error: message }); }
function validId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
function now() { return new Date().toISOString(); }

function parseDate(value) {
  if (typeof value !== 'string' || !isoPattern.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rateLimiter() {
  const attempts = new Map();
  return (key, limit) => {
    const time = Date.now();
    if (attempts.size > 10000) {
      for (const [name, entry] of attempts) if (entry.until <= time) attempts.delete(name);
      if (attempts.size > 10000) attempts.clear();
    }
    const entry = attempts.get(key);
    const next = !entry || entry.until <= time
      ? { count: 1, until: time + RATE_WINDOW_MS }
      : { count: entry.count + 1, until: entry.until };
    attempts.set(key, next);
    return next.count <= limit;
  };
}

export function createApp({
  db,
  secureCookie = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  appOrigin = process.env.APP_ORIGIN
}) {
  if (appOrigin) {
    const parsed = new URL(appOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== appOrigin) {
      throw new Error('APP_ORIGIN must be a single http(s) origin without a trailing slash.');
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_ORIGIN is required in production.');
  }
  const app = express();
  const withinLimit = rateLimiter();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (appOrigin?.startsWith('https://')) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      let allowedOrigin = appOrigin;
      if (!allowedOrigin) {
        const host = req.get('host');
        allowedOrigin = host && `${req.protocol}://${host}`;
      }
      if (!origin || origin !== allowedOrigin) {
        return fail(res, 403, 'Request origin is not allowed.');
      }
      if (!req.is('application/json')) return fail(res, 415, 'JSON is required.');
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    const rawToken = parseCookies(req.get('cookie')).session;
    if (rawToken) {
      const session = db.prepare(`SELECT s.token_hash, s.csrf_token, u.id, u.email, u.role
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(rawToken), Date.now());
      if (session) req.session = session;
    }
    next();
  });

  function setSession(res, user) {
    const raw = token();
    const csrf = token();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash(raw), user.id, csrf, Date.now() + SESSION_SECONDS * 1000);
    res.cookie('session', raw, {
      httpOnly: true, sameSite: 'strict', secure: secureCookie,
      maxAge: SESSION_SECONDS * 1000, path: '/'
    });
    return { user: { id: user.id, email: user.email, role: user.role }, csrfToken: csrf };
  }

  function requireUser(req, res, next) {
    if (!req.session) return fail(res, 401, 'Please log in.');
    next();
  }
  function requireCsrf(req, res, next) {
    if (req.get('x-csrf-token') !== req.session.csrf_token) return fail(res, 403, 'Invalid CSRF token.');
    next();
  }
  function requireAdmin(req, res, next) {
    if (req.session.role !== 'admin') return fail(res, 403, 'Admin access required.');
    next();
  }

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/me', (req, res) => res.json(req.session
    ? { user: { id: req.session.id, email: req.session.email, role: req.session.role }, csrfToken: req.session.csrf_token }
    : { user: null, csrfToken: null }));

  app.post('/api/signup', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!withinLimit(`signup:${req.ip}`, 20)) return fail(res, 429, 'Too many attempts. Try again later.');
    if (email.length > 254 || !emailPattern.test(email) || typeof password !== 'string' || password.length < 12 || password.length > 256) {
      return fail(res, 400, 'Enter a valid email and a password of 12–256 characters.');
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return fail(res, 409, 'Email is already registered.');
    const result = db.prepare('INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
      .run(email, hashPassword(password), 'user', now());
    return res.status(201).json(setSession(res, { id: Number(result.lastInsertRowid), email, role: 'user' }));
  });

  app.post('/api/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!withinLimit(`login-ip:${req.ip}`, 100) || !withinLimit(`login-account:${email}`, 10)) {
      return fail(res, 429, 'Too many attempts. Try again later.');
    }
    const user = db.prepare('SELECT id, email, role, password_hash FROM users WHERE email = ?').get(email);
    if (typeof password !== 'string' || !user || !verifyPassword(password, user.password_hash)) {
      return fail(res, 401, 'Invalid email or password.');
    }
    return res.json(setSession(res, user));
  });

  app.post('/api/logout', requireUser, requireCsrf, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.session.token_hash);
    res.clearCookie('session', { path: '/', sameSite: 'strict', secure: secureCookie });
    res.json({ ok: true });
  });

  app.get('/api/slots', (_req, res) => {
    const slots = db.prepare(`SELECT s.id, s.starts_at AS startsAt, s.ends_at AS endsAt
      FROM slots s LEFT JOIN bookings b ON b.slot_id = s.id AND b.cancelled_at IS NULL
      WHERE s.deleted_at IS NULL AND s.starts_at > ? AND b.id IS NULL
      ORDER BY s.starts_at`).all(now());
    res.json({ slots });
  });

  app.get('/api/bookings', requireUser, (req, res) => {
    const bookings = db.prepare(`SELECT b.id, b.slot_id AS slotId, s.starts_at AS startsAt,
      s.ends_at AS endsAt, b.created_at AS createdAt, b.cancelled_at AS cancelledAt
      FROM bookings b JOIN slots s ON s.id = b.slot_id
      WHERE b.user_id = ? ORDER BY s.starts_at DESC`).all(req.session.id);
    res.json({ bookings });
  });

  app.post('/api/bookings', requireUser, requireCsrf, (req, res) => {
    const slotId = validId(String(req.body?.slotId ?? ''));
    if (!slotId) return fail(res, 400, 'Invalid slot ID.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const slot = db.prepare(`SELECT id FROM slots WHERE id = ? AND deleted_at IS NULL AND starts_at > ?`).get(slotId, now());
      const booked = db.prepare('SELECT id FROM bookings WHERE slot_id = ? AND cancelled_at IS NULL').get(slotId);
      if (!slot || booked) { db.exec('ROLLBACK'); return fail(res, 409, 'This slot is no longer available.'); }
      const result = db.prepare('INSERT INTO bookings (slot_id, user_id, created_at) VALUES (?, ?, ?)')
        .run(slotId, req.session.id, now());
      db.exec('COMMIT');
      return res.status(201).json({ id: Number(result.lastInsertRowid), slotId });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });

  app.delete('/api/bookings/:id', requireUser, requireCsrf, (req, res) => {
    const id = validId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid booking ID.');
    const result = db.prepare(`UPDATE bookings SET cancelled_at = ?
      WHERE id = ? AND user_id = ? AND cancelled_at IS NULL AND
      (SELECT starts_at FROM slots WHERE id = slot_id) > ?`).run(now(), id, req.session.id, now());
    if (!result.changes) return fail(res, 404, 'Active future booking not found.');
    res.json({ ok: true });
  });

  app.get('/api/admin/bookings', requireUser, requireAdmin, (_req, res) => {
    const bookings = db.prepare(`SELECT b.id, b.slot_id AS slotId, u.email,
      s.starts_at AS startsAt, s.ends_at AS endsAt,
      b.created_at AS createdAt, b.cancelled_at AS cancelledAt
      FROM bookings b JOIN slots s ON s.id = b.slot_id JOIN users u ON u.id = b.user_id
      ORDER BY s.starts_at DESC`).all();
    res.json({ bookings });
  });

  app.get('/api/admin/slots', requireUser, requireAdmin, (_req, res) => {
    const slots = db.prepare(`SELECT s.id, s.starts_at AS startsAt, s.ends_at AS endsAt,
      b.id AS bookingId FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id AND b.cancelled_at IS NULL
      WHERE s.deleted_at IS NULL AND s.starts_at > ? ORDER BY s.starts_at`).all(now());
    res.json({ slots });
  });

  app.post('/api/admin/slots', requireUser, requireCsrf, requireAdmin, (req, res) => {
    const startsAt = parseDate(req.body?.startsAt);
    const endsAt = parseDate(req.body?.endsAt);
    if (!startsAt || !endsAt || startsAt <= now() || Date.parse(endsAt) - Date.parse(startsAt) < 5 * 60000 || Date.parse(endsAt) - Date.parse(startsAt) > 8 * 3600000) {
      return fail(res, 400, 'Choose a future slot lasting 5 minutes to 8 hours.');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const overlap = db.prepare(`SELECT id FROM slots WHERE deleted_at IS NULL AND starts_at < ? AND ends_at > ?`).get(endsAt, startsAt);
      if (overlap) { db.exec('ROLLBACK'); return fail(res, 409, 'This slot overlaps an existing slot.'); }
      const result = db.prepare('INSERT INTO slots (starts_at, ends_at, created_at) VALUES (?, ?, ?)')
        .run(startsAt, endsAt, now());
      db.exec('COMMIT');
      return res.status(201).json({ id: Number(result.lastInsertRowid), startsAt, endsAt });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });

  app.delete('/api/admin/slots/:id', requireUser, requireCsrf, requireAdmin, (req, res) => {
    const id = validId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid slot ID.');
    const result = db.prepare(`UPDATE slots SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM bookings WHERE slot_id = slots.id AND cancelled_at IS NULL)`)
      .run(now(), id);
    if (!result.changes) return fail(res, 409, 'Slot not found or has an active booking.');
    res.json({ ok: true });
  });

  app.use(express.static(join(root, 'public')));
  app.use('/api', (_req, res) => fail(res, 404, 'API endpoint not found.'));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return fail(res, 400, 'Invalid JSON.');
    if (error.type === 'entity.too.large') return fail(res, 413, 'Request body is too large.');
    console.error(error);
    return fail(res, 500, 'Internal server error.');
  });
  return app;
}

export function bootstrapAdmin(db, email, password) {
  if (!email && !password) return;
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!email || !password || email.length > 254 || !emailPattern.test(email) || password.length < 12 || password.length > 256 || password === 'replace-with-a-long-unique-password') {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set together; password must be 12–256 characters.');
  }
  const existing = db.prepare('SELECT role FROM users WHERE email = ?').get(email);
  if (existing && existing.role !== 'admin') throw new Error('ADMIN_EMAIL already belongs to a regular user.');
  if (!existing) db.prepare('INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
    .run(email, hashPassword(password), 'admin', now());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = openDatabase(process.env.DATA_DIR || join(root, 'data'));
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in production.');
  }
  bootstrapAdmin(db, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const port = 3000;
  createApp({ db }).listen(port, '0.0.0.0', () => console.log(`Appointment booking on port ${port}`));
}
