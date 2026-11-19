'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { sessionMiddleware } = require('./lib/session');
const { csrfProtection } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');
const { HttpError } = require('./lib/validate');

const authRoutes = require('./routes/auth');
const slotRoutes = require('./routes/slots');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();

  // Only trust forwarding headers from the number of proxies we actually have.
  app.set('trust proxy', config.trustProxy);
  app.set('x-powered-by', false);
  app.set('etag', false);
  app.set('query parser', 'simple'); // no nested-object query strings

  // Security headers. The CSP is strict: no inline script, no inline style, no
  // remote origins at all - the front end is plain files served from here.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'base-uri': ["'none'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'object-src': ["'none'"],
          'manifest-src': ["'self'"],
          ...(config.secureCookies === 'never' ? {} : { 'upgrade-insecure-requests': [] }),
        },
      },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: config.secureCookies === 'never'
        ? false
        : { maxAge: 31536000, includeSubDomains: true, preload: false },
      frameguard: { action: 'deny' },
    }),
  );
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
    next();
  });

  // Global request ceiling, mostly to blunt brute-force and scraping bursts.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.rateLimits.globalPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res, next) => {
        const err = new HttpError(429, 'Too many requests. Please slow down.', 'rate_limited');
        err.retryAfterSeconds = 60;
        next(err);
      },
    }),
  );

  app.use(express.json({ limit: config.bodyLimit, strict: true }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // Static front end. No directory listing, no dotfiles, short cache.
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      index: ['index.html'],
      dotfiles: 'ignore',
      redirect: false,
      maxAge: config.isProd ? '5m' : 0,
      setHeaders(res) {
        res.set('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  // API responses carry per-user data: never let a browser, a proxy or a CDN
  // keep a copy of them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    next();
  });

  // Session resolution and CSRF checks apply to the API only.
  app.use('/api', sessionMiddleware, csrfProtection);
  app.use('/api/auth', authRoutes);
  app.use('/api/slots', slotRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
