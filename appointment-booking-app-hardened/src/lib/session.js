'use strict';

const config = require('../config');
const { getDb } = require('../db');
const { randomToken, hashToken, timingSafeEqualStr } = require('./tokens');

function nowIso() {
  return new Date().toISOString();
}

/** Parse a Cookie header without pulling in a dependency. */
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header || header.length > 8192) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function cookieIsSecure(req) {
  if (config.secureCookies === 'always') return true;
  if (config.secureCookies === 'never') return false;
  return req.secure === true; // honours X-Forwarded-Proto only via trust proxy
}

function setSessionCookie(req, res, token, maxAgeMs) {
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: cookieIsSecure(req),
    path: '/',
    maxAge: maxAgeMs,
  });
}

/**
 * The CSRF token is delivered in a readable cookie (a synchroniser token the
 * page echoes back in a header). Only its digest is stored server-side, so the
 * value is stable across tabs yet a database dump reveals nothing usable.
 */
function setCsrfCookie(req, res, token, maxAgeMs) {
  res.cookie(config.csrfCookieName, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: cookieIsSecure(req),
    path: '/',
    maxAge: maxAgeMs,
  });
}

function clearSessionCookie(req, res) {
  const opts = { sameSite: 'strict', secure: cookieIsSecure(req), path: '/' };
  res.clearCookie(config.session.cookieName, { ...opts, httpOnly: true });
  res.clearCookie(config.csrfCookieName, { ...opts, httpOnly: false });
}

/**
 * Create a brand-new session. Called only right after a successful
 * authentication, which also rotates any pre-existing session identifier and so
 * prevents session fixation.
 */
function createSession(req, res, userId) {
  const db = getDb();
  const token = randomToken();
  const csrfToken = randomToken();
  const created = Date.now();

  db.prepare(
    `INSERT INTO sessions (id, user_id, csrf_hash, created_at, last_seen_at, expires_at, hard_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hashToken(token),
    userId,
    hashToken(csrfToken),
    new Date(created).toISOString(),
    new Date(created).toISOString(),
    new Date(created + config.session.ttlMs).toISOString(),
    new Date(created + config.session.absoluteTtlMs).toISOString(),
  );

  setSessionCookie(req, res, token, config.session.ttlMs);
  setCsrfCookie(req, res, csrfToken, config.session.ttlMs);
  return { csrfToken };
}

function destroySession(req, res) {
  const token = readCookie(req, config.session.cookieName);
  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
  }
  clearSessionCookie(req, res);
}

/** Drop every session belonging to a user (used on password-sensitive changes). */
function destroyAllSessionsForUser(userId) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function purgeExpiredSessions() {
  getDb()
    .prepare('DELETE FROM sessions WHERE expires_at <= ? OR hard_expires_at <= ?')
    .run(nowIso(), nowIso());
}

/**
 * Express middleware: resolves the session cookie to req.user / req.session.
 * An invalid, expired or orphaned cookie is treated exactly like no cookie.
 */
function sessionMiddleware(req, res, next) {
  req.user = null;
  req.session = null;

  const token = readCookie(req, config.session.cookieName);
  if (!token || token.length < 16 || token.length > 256) return next();

  const db = getDb();
  const id = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.id, s.user_id, s.csrf_hash, s.last_seen_at, s.expires_at, s.hard_expires_at,
              u.email, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(id);

  if (!row) {
    clearSessionCookie(req, res);
    return next();
  }

  const now = Date.now();
  if (Date.parse(row.expires_at) <= now || Date.parse(row.hard_expires_at) <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    clearSessionCookie(req, res);
    return next();
  }

  // Sliding expiry, capped by hard_expires_at. The row is only rewritten once a
  // minute so that a burst of requests cannot amplify into a burst of writes.
  const slidingExpiry = Math.min(now + config.session.ttlMs, Date.parse(row.hard_expires_at));
  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || now - lastSeen > 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      new Date(now).toISOString(),
      new Date(slidingExpiry).toISOString(),
      id,
    );
    setSessionCookie(req, res, token, Math.max(slidingExpiry - now, 0));
  }

  req.session = { id, csrfHash: row.csrf_hash };
  req.user = { id: row.user_id, email: row.email, role: row.role };
  return next();
}

/**
 * Return the CSRF token for the current session, re-issuing it if the browser
 * lost the cookie or presents one that no longer matches the stored digest.
 */
function ensureCsrfToken(req, res) {
  if (!req.session) return null;
  const presented = readCookie(req, config.csrfCookieName);
  if (presented && csrfMatches(req, presented)) return presented;

  const csrfToken = randomToken();
  const digest = hashToken(csrfToken);
  getDb().prepare('UPDATE sessions SET csrf_hash = ? WHERE id = ?').run(digest, req.session.id);
  req.session.csrfHash = digest;
  setCsrfCookie(req, res, csrfToken, config.session.ttlMs);
  return csrfToken;
}

function csrfMatches(req, presented) {
  if (!req.session || typeof presented !== 'string' || presented.length === 0) return false;
  return timingSafeEqualStr(hashToken(presented), req.session.csrfHash);
}

module.exports = {
  createSession,
  destroySession,
  destroyAllSessionsForUser,
  purgeExpiredSessions,
  sessionMiddleware,
  ensureCsrfToken,
  csrfMatches,
  readCookie,
};
