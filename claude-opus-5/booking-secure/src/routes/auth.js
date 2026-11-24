'use strict';

const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { getDb } = require('../db');
const { hashPassword, verifyPassword } = require('../lib/password');
const {
  createSession,
  destroySession,
  destroyAllSessionsForUser,
  ensureCsrfToken,
} = require('../lib/session');
const {
  HttpError,
  requireObject,
  requireEmail,
  requirePassword,
  requireString,
} = require('../lib/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// A hash of an unguessable value, computed once at startup. Verifying a wrong
// password against it for unknown accounts keeps "no such user" and "wrong
// password" indistinguishable in timing, so logins cannot enumerate accounts.
const dummyHashPromise = hashPassword(crypto.randomBytes(32).toString('hex'));
dummyHashPromise.catch(() => {});

const limiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    const err = new HttpError(429, 'Too many attempts. Please try again later.', 'rate_limited');
    err.retryAfterSeconds = 60;
    next(err);
  },
};

const loginLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.loginPerQuarterHour,
});

const signupLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimits.signupPerHour,
});

// A session alone must not become an oracle for the account's current password.
const passwordChangeLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.loginPerQuarterHour,
});

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

router.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const body = requireObject(req.body);
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);

    const passwordHash = await hashPassword(password);
    const db = getDb();

    let info;
    try {
      info = db
        .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')")
        .run(email, passwordHash);
    } catch (e) {
      if (e && String(e.code).startsWith('SQLITE_CONSTRAINT')) {
        throw new HttpError(409, 'An account with that email already exists.', 'email_taken');
      }
      throw e;
    }

    // Role is hard-coded above: a client cannot sign itself up as an admin.
    const userId = Number(info.lastInsertRowid);
    const { csrfToken } = createSession(req, res, userId);
    res.status(201).json({ user: { id: userId, email, role: 'user' }, csrfToken });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = requireObject(req.body);
    // Deliberately lenient parsing here: a malformed login is just a failed one.
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    const password = typeof body.password === 'string' ? body.password.slice(0, config.password.maxLength) : '';

    const db = getDb();
    const user = db
      .prepare('SELECT id, email, password_hash, role, failed_logins, locked_until FROM users WHERE email = ?')
      .get(email);

    const invalid = new HttpError(401, 'Invalid email or password.', 'invalid_credentials');

    if (!user) {
      await verifyPassword(password, await dummyHashPromise);
      throw invalid;
    }

    if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
      await verifyPassword(password, await dummyHashPromise);
      // Same generic message: do not confirm that this address owns an account.
      throw invalid;
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const failures = user.failed_logins + 1;
      const lockedUntil =
        failures >= config.lockout.maxFailures
          ? new Date(Date.now() + config.lockout.windowMs).toISOString()
          : null;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(
        lockedUntil ? 0 : failures,
        lockedUntil,
        user.id,
      );
      throw invalid;
    }

    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // Fresh session identifier on every login => no session fixation.
    destroySession(req, res);
    const { csrfToken } = createSession(req, res, user.id);
    res.json({ user: publicUser(user), csrfToken });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  try {
    destroySession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res, next) => {
  try {
    if (!req.user) return res.json({ user: null, csrfToken: null });
    return res.json({ user: publicUser(req.user), csrfToken: ensureCsrfToken(req, res) });
  } catch (err) {
    return next(err);
  }
});

router.post('/password', passwordChangeLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = requireObject(req.body);
    const current = requireString(body.currentPassword, 'currentPassword', {
      min: 1,
      max: config.password.maxLength,
      trim: false,
    });
    const next_ = requirePassword(body.newPassword);

    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!row || !(await verifyPassword(current, row.password_hash))) {
      throw new HttpError(403, 'Current password is incorrect.', 'invalid_credentials');
    }

    const hash = await hashPassword(next_);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

    // Changing the password signs out every device, including this one.
    destroyAllSessionsForUser(req.user.id);
    destroySession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
