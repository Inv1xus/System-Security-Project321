'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours in ms
const JWT_EXPIRES_IN = '2h';

// Tight rate limit on auth endpoints to slow brute-force attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// --- Helpers ---

function issueToken(res, user) {
  const payload = { id: user.id, username: user.username, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
  });
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
  });
  return payload;
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username.length < 3 || username.length > 32) return false;
  if (password.length < 8 || password.length > 128) return false;
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return false;
  return true;
}

// --- Routes ---

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!validateCredentials(username, password)) {
    return res.status(400).json({
      error:
        'Username must be 3–32 alphanumeric characters. Password must be 8–128 characters.',
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db
    .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')")
    .run(username, hash);

  const user = { id: result.lastInsertRowid, username, role: 'user' };
  const payload = issueToken(res, user);
  res.status(201).json({ message: 'Account created.', user: payload });
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!validateCredentials(username, password)) {
    return res.status(400).json({ error: 'Invalid credentials.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  // Always run bcrypt compare to prevent timing-based username enumeration
  const dummyHash = '$2b$12$invalidhashfortimingnormalization000000000000000000000000';
  const match = await bcrypt.compare(password, user ? user.password : dummyHash);

  if (!user || !match) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const payload = issueToken(res, user);
  res.json({ message: 'Logged in.', user: payload });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
  res.json({ message: 'Logged out.' });
});

// GET /api/auth/me  — lets the frontend know the current session state
router.get('/me', requireAuth, (req, res) => {
  const { id, username, role } = req.user;
  res.json({ id, username, role });
});

module.exports = router;
