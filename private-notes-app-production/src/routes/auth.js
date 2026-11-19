import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { SESSION_COOKIE_NAME } from '../constants.js';
import { statements } from '../db.js';
import { hashPassword, verifyPassword, fakeVerify } from '../lib/password.js';
import { loginUser, requireAuth } from '../middleware/auth.js';
import { validateEmail, validatePassword } from '../middleware/validate.js';

export const authRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this address. Try again later.' },
});

function publicUser(user) {
  return { id: user.id, email: user.email };
}

authRouter.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { email, emailNorm } = validateEmail(body.email);
    const password = validatePassword(body.password);

    // Cheap pre-check before the deliberately expensive hash, so repeated
    // signups for an existing address cannot be used to burn CPU. The UNIQUE
    // constraint below still settles concurrent requests.
    if (statements.findUserByEmail.get(emailNorm)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = statements.createUser.get(email, emailNorm, passwordHash);
    } catch (err) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw err;
    }

    await loginUser(req, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const passwordRaw = typeof body.password === 'string' ? body.password : '';

    const user = emailRaw ? statements.findUserByEmail.get(emailRaw) : null;

    // Same generic response and comparable work for unknown emails and
    // wrong passwords, so neither reveals whether an account exists.
    const ok = user
      ? await verifyPassword(passwordRaw, user.password_hash)
      : await fakeVerify();

    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await loginUser(req, user);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/logout', (req, res, next) => {
  if (!req.session) return res.status(204).end();
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
    });
    return res.status(204).end();
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
