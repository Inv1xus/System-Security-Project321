'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { requireGuest } = require('../middleware/auth');

const router = express.Router();

const BCRYPT_ROUNDS = 12;

// Username rules: 3–32 alphanumeric/underscore characters
const usernameRules = body('username')
  .trim()
  .isLength({ min: 3, max: 32 })
  .withMessage('Username must be 3–32 characters.')
  .matches(/^[a-zA-Z0-9_]+$/)
  .withMessage('Username may only contain letters, numbers, and underscores.');

// Password rules: 8–128 characters
const passwordRules = body('password')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be 8–128 characters.');

// ── GET /signup ──────────────────────────────────────────────────────────────
router.get('/signup', requireGuest, (req, res) => {
  res.render('signup', { errors: [], values: {} });
});

// ── POST /signup ─────────────────────────────────────────────────────────────
router.post(
  '/signup',
  requireGuest,
  usernameRules,
  passwordRules,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('signup', {
        errors: errors.array(),
        values: { username: req.body.username },
      });
    }

    const { username, password } = req.body;

    try {
      const existing = db
        .prepare('SELECT id FROM users WHERE username = ?')
        .get(username);

      if (existing) {
        return res.status(409).render('signup', {
          errors: [{ msg: 'Username is already taken.' }],
          values: { username },
        });
      }

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const result = db
        .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
        .run(username, hash);

      // Log the user in immediately after signup
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = result.lastInsertRowid;
        req.session.username = username;
        req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
        res.redirect('/notes');
      });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).render('error', { message: 'An unexpected error occurred.' });
    }
  }
);

// ── GET /login ───────────────────────────────────────────────────────────────
router.get('/login', requireGuest, (req, res) => {
  res.render('login', { errors: [], values: {} });
});

// ── POST /login ──────────────────────────────────────────────────────────────
router.post(
  '/login',
  requireGuest,
  usernameRules,
  body('password').notEmpty().withMessage('Password is required.'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('login', {
        errors: errors.array(),
        values: { username: req.body.username },
      });
    }

    const { username, password } = req.body;

    try {
      const user = db
        .prepare('SELECT id, username, password FROM users WHERE username = ?')
        .get(username);

      // Use a constant-time comparison even when user doesn't exist to prevent
      // username enumeration via timing differences.
      // bcryptjs uses $2a$ prefix; hash must be exactly 60 chars.
      const DUMMY_HASH =
        '$2a$12$invalidhashusedtoblindtimingoracleszzzzzzzzzzzzzzzzzz';
      const hash = user ? user.password : DUMMY_HASH;
      const match = await bcrypt.compare(password, hash);

      if (!user || !match) {
        return res.status(401).render('login', {
          errors: [{ msg: 'Invalid username or password.' }],
          values: { username },
        });
      }

      const returnTo = req.session.returnTo || '/notes';
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
        // Only allow relative return URLs to prevent open-redirect
        const safe = returnTo.startsWith('/') ? returnTo : '/notes';
        res.redirect(safe);
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).render('error', { message: 'An unexpected error occurred.' });
    }
  }
);

// ── POST /logout ─────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('sessionId');
    res.redirect('/login');
  });
});

module.exports = router;
