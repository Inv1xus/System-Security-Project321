import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function int(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

const env = process.env;
const nodeEnv = env.NODE_ENV || 'production';
const dataDir = path.resolve(env.DATA_DIR || '/data');

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

/**
 * Session secret resolution.
 *
 * Preferred: supply SESSION_SECRET via the environment (rotatable, never on disk).
 * Fallback: generate a 32-byte key once and store it in the data volume with 0600
 * permissions, so sessions survive container restarts instead of silently using a
 * fresh random secret on every boot (which would log everyone out) or, worse, a
 * hard-coded default baked into the image.
 */
function resolveSessionSecret() {
  const fromEnv = (env.SESSION_SECRET || '').trim();
  if (fromEnv) {
    if (fromEnv.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters long.');
    }
    return fromEnv;
  }

  const keyFile = path.join(dataDir, 'session.key');
  try {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(keyFile, generated, { mode: 0o600, flag: 'wx' });
  } catch (err) {
    // Another process won the race; adopt the key it wrote.
    if (err.code === 'EEXIST') return fs.readFileSync(keyFile, 'utf8').trim();
    throw err;
  }
  console.warn(
    `[config] SESSION_SECRET not set; generated a persistent key at ${keyFile}. ` +
      'Set SESSION_SECRET in the environment for production deployments.'
  );
  return generated;
}

export const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: int(env.PORT, 3000, { min: 1, max: 65535 }),
  host: env.HOST || '0.0.0.0',
  dataDir,
  databaseFile: path.join(dataDir, 'notes.sqlite'),
  sessionSecret: resolveSessionSecret(),
  cookieSecure: bool(env.COOKIE_SECURE, false),
  trustProxy: int(env.TRUST_PROXY, 0, { min: 0, max: 10 }),
  sessionTtlMs: int(env.SESSION_TTL_MINUTES, 120, { min: 5, max: 60 * 24 * 30 }) * 60 * 1000,

  limits: Object.freeze({
    emailMax: 254,
    passwordMin: 12,
    passwordMax: 128,
    titleMax: 200,
    contentMax: 20000,
    notesPerUser: 1000,
    // Comfortably above contentMax so that a legitimate note made of
    // multi-byte characters gets a clear 400, not an opaque 413.
    jsonBodyBytes: 128 * 1024,
  }),
});
