import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { SESSION_COOKIE_NAME } from './constants.js';
import { SqliteSessionStore } from './lib/session-store.js';
import { csrfProtection, csrfTokenHandler } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { notesRouter } from './routes/notes.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp() {
  const app = express();

  // Only trust the number of proxies actually in front of us; trusting all
  // proxies would let a client spoof X-Forwarded-For and evade rate limits.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'object-src': ["'none'"],
          ...(config.cookieSecure ? { 'upgrade-insecure-requests': [] } : {}),
        },
      },
      frameguard: { action: 'deny' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      // HSTS is only meaningful (and only safe) when served over HTTPS.
      hsts: config.cookieSecure
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false,
    })
  );

  app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  });

  // Blanket limiter: a backstop against brute force and scraping across all
  // endpoints; the auth routes add their own, much tighter limits.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Slow down.' },
    })
  );

  app.use(express.json({ limit: config.limits.jsonBodyBytes, strict: true }));

  const store = new SqliteSessionStore({ ttlMs: config.sessionTtlMs });
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: config.trustProxy > 0,
      cookie: {
        httpOnly: true,            // not readable from JavaScript
        sameSite: 'strict',        // not sent on cross-site requests
        secure: config.cookieSecure, // HTTPS only, when enabled
        maxAge: config.sessionTtlMs,
        path: '/',
      },
    })
  );
  app.locals.sessionStore = store;

  // Scoped to /api so that health checks, crawlers and static asset requests
  // never create a session row just by touching the site.
  app.use('/api', csrfProtection);

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/csrf', csrfTokenHandler);
  app.use('/api/auth', authRouter);
  app.use('/api/notes', notesRouter);

  app.use(
    express.static(publicDir, {
      index: 'index.html',
      dotfiles: 'ignore',
      // ETag revalidation rather than time-based caching: assets are tiny and
      // this guarantees a deploy is never served stale to returning users.
      etag: true,
      lastModified: true,
      maxAge: 0,
      setHeaders(res, filePath) {
        res.setHeader(
          'Cache-Control',
          filePath.endsWith('.html') ? 'no-store' : 'no-cache'
        );
      },
    })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
