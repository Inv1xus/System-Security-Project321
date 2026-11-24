'use strict';

/**
 * Centralised, validated configuration.
 *
 * Every value is read from the environment exactly once, at startup, so that a
 * misconfiguration fails fast and loudly instead of silently weakening the app
 * at request time.
 */

function intEnv(name, def, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid ${name}: expected an integer between ${min} and ${max}`);
  }
  return n;
}

function enumEnv(name, def, allowed) {
  const raw = (process.env[name] || def).toLowerCase();
  if (!allowed.includes(raw)) {
    throw new Error(`Invalid ${name}: expected one of ${allowed.join(', ')}`);
  }
  return raw;
}

const nodeEnv = enumEnv('NODE_ENV', 'production', ['production', 'development', 'test']);
const isProd = nodeEnv === 'production';

const config = Object.freeze({
  nodeEnv,
  isProd,

  // The task requires port 3000; it stays overridable for local experiments.
  port: intEnv('PORT', 3000, { min: 1, max: 65535 }),
  host: process.env.HOST || '0.0.0.0',

  // SQLite file. Mount the parent directory as a volume to persist data.
  dbFile: process.env.DB_FILE || '/data/app.db',

  // Number of reverse proxies in front of the app. 0 = direct exposure.
  // Never set this higher than the real number of trusted proxies: it decides
  // which X-Forwarded-For entry is treated as the client IP for rate limiting.
  trustProxy: intEnv('TRUST_PROXY', 0, { min: 0, max: 10 }),

  // 'auto'   -> Secure flag set when the request arrived over HTTPS
  // 'always' -> always set (correct behind a TLS-terminating proxy)
  // 'never'  -> never set (plain-HTTP development only)
  secureCookies: enumEnv('SECURE_COOKIES', 'auto', ['auto', 'always', 'never']),

  session: {
    cookieName: 'sid',
    ttlMs: intEnv('SESSION_TTL_MINUTES', 720, { min: 5, max: 10080 }) * 60 * 1000,
    // Absolute cap: a session is destroyed this long after creation even if active.
    absoluteTtlMs: intEnv('SESSION_ABSOLUTE_TTL_HOURS', 24 * 7, { min: 1, max: 24 * 90 }) * 3600 * 1000,
  },

  password: {
    minLength: intEnv('PASSWORD_MIN_LENGTH', 12, { min: 12, max: 64 }),
    maxLength: 200,
  },

  // Request ceilings. Lower values are safer; raise only if legitimate traffic
  // is being turned away.
  rateLimits: {
    globalPerMinute: intEnv('RATE_LIMIT_GLOBAL_PER_MINUTE', 300, { min: 10, max: 100000 }),
    loginPerQuarterHour: intEnv('RATE_LIMIT_LOGIN_PER_15MIN', 20, { min: 3, max: 100000 }),
    signupPerHour: intEnv('RATE_LIMIT_SIGNUP_PER_HOUR', 10, { min: 1, max: 100000 }),
  },

  lockout: {
    maxFailures: intEnv('LOGIN_MAX_FAILURES', 8, { min: 3, max: 100 }),
    windowMs: intEnv('LOGIN_LOCK_MINUTES', 15, { min: 1, max: 1440 }) * 60 * 1000,
  },

  booking: {
    // Guard rails so a single account cannot exhaust the schedule or the DB.
    maxActivePerUser: intEnv('MAX_ACTIVE_BOOKINGS_PER_USER', 20, { min: 1, max: 500 }),
    maxSlotCapacity: intEnv('MAX_SLOT_CAPACITY', 100, { min: 1, max: 10000 }),
    maxSlotDurationMinutes: intEnv('MAX_SLOT_DURATION_MINUTES', 24 * 60, { min: 5, max: 7 * 24 * 60 }),
  },

  // Optional first-run admin bootstrap. Both must be present to take effect.
  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },

  // Extra origins allowed to send state-changing requests. Same-origin always is.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  csrfCookieName: 'csrf',

  bodyLimit: '16kb',
});

module.exports = config;
