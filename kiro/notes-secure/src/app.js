'use strict';

const path = require('path');
const crypto = require('crypto');

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteSessionStore = require('./db/sessionStore');
const csrfMiddleware = require('./middleware/csrf');
const fs = require('fs');

// ── Environment ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PROD = NODE_ENV === 'production';

// SESSION_SECRET must be set in production. Generate a random one for dev only.
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  if (IS_PROD) {
    console.error('FATAL: SESSION_SECRET environment variable is not set.');
    process.exit(1);
  }
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: Using ephemeral session secret. Set SESSION_SECRET for persistent sessions.');
}

// ── Data directory for sessions & DB ─────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

// Trust the first proxy hop (needed for secure cookies behind reverse proxies)
if (IS_PROD) {
  app.set('trust proxy', 1);
}

// ── View engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Disable "X-Powered-By: Express" header
app.disable('x-powered-by');

// ── Security headers (Helmet) ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: null,
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// ── Sessions ──────────────────────────────────────────────────────────────────
const db = require('./db/database');

app.use(
  session({
    store: new SQLiteSessionStore(db),
    name: 'sessionId',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PROD && process.env.LOCAL_HTTP_TEST !== 'true',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// ── CSRF protection ───────────────────────────────────────────────────────────
app.use(csrfMiddleware);

// Make CSRF token and current user available to all views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.locals.currentUser = req.session.username || null;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/notes');
  res.redirect('/login');
});

app.use('/', require('./routes/auth'));
app.use('/notes', require('./routes/notes'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).render('error', {
    message: IS_PROD ? 'An unexpected error occurred.' : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Notes app running on port ${PORT} [${NODE_ENV}]`);
});

module.exports = app;
