// Password hashing and cookie-backed sessions, built on node:crypto only.
import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('hex'),
    hash.toString('hex'),
  ].join('$');
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function createSession(res, userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId, now, now + SESSION_TTL_MS);

  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return id;
}

export function destroySession(req, res) {
  const id = readCookie(req, SESSION_COOKIE);
  if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Attaches req.user when the cookie points at a live session; otherwise leaves it null.
export function attachUser(req, _res, next) {
  req.user = null;
  const id = readCookie(req, SESSION_COOKIE);
  if (id) {
    const row = db
      .prepare(
        `SELECT users.id AS id, users.username AS username
           FROM sessions
           JOIN users ON users.id = sessions.user_id
          WHERE sessions.id = ? AND sessions.expires_at > ?`
      )
      .get(id, Date.now());
    if (row) req.user = row;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}
