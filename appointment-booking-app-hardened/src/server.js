'use strict';

const config = require('./config');
const { createApp } = require('./app');
const { getDb, close } = require('./db');
const { hashPassword } = require('./lib/password');
const { purgeExpiredSessions } = require('./lib/session');

/**
 * Create the administrator account on first boot, if ADMIN_EMAIL and
 * ADMIN_PASSWORD are supplied. An existing account is never silently
 * overwritten - that would turn a stale environment variable into a password
 * reset - and the credentials are never logged.
 */
async function bootstrapAdmin() {
  const { email: rawEmail, password } = config.bootstrapAdmin;
  if (!rawEmail || !password) return;

  const email = rawEmail.trim().toLowerCase();
  if (password.length < config.password.minLength) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${config.password.minLength} characters. Refusing to start.`,
    );
  }

  const db = getDb();
  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
  if (existing) {
    if (existing.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
      console.log('[bootstrap] promoted existing account to admin');
    }
    return;
  }

  const hash = await hashPassword(password);
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')").run(email, hash);
  console.log('[bootstrap] administrator account created');
}

function warnAboutConfig() {
  const db = getDb();
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
  if (n === 0) {
    console.warn(
      '[warn] no administrator exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart.',
    );
  }
  if (config.isProd && config.secureCookies === 'never') {
    console.warn('[warn] SECURE_COOKIES=never in production: cookies will travel in clear text.');
  }
  if (config.isProd && config.secureCookies === 'auto') {
    console.warn(
      '[warn] SECURE_COOKIES=auto: serve this app over HTTPS (set SECURE_COOKIES=always behind a TLS proxy).',
    );
  }
}

async function main() {
  getDb();
  await bootstrapAdmin();
  warnAboutConfig();
  purgeExpiredSessions();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`appointment-booking listening on http://${config.host}:${config.port}`);
  });

  // Slow-loris mitigation: cap how long headers and whole requests may take.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 10_000;

  const sweeper = setInterval(() => {
    try {
      purgeExpiredSessions();
    } catch (err) {
      console.error('[sweeper]', err);
    }
  }, 15 * 60 * 1000);
  sweeper.unref();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, closing`);
    clearInterval(sweeper);
    server.close(() => {
      try {
        close();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  console.error('[fatal]', err && err.message ? err.message : err);
  process.exit(1);
});
