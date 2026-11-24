import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const DB_PATH = path.resolve(process.env.DB_PATH || './data/appointments.db');

function resolveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }

  if (envSecret && envSecret.length > 0 && envSecret.length < 32) {
    console.warn(
      '[security] SESSION_SECRET is shorter than 32 characters; generating a persistent cryptographic secret instead.'
    );
  }

  const dbDir = path.dirname(DB_PATH);
  fs.mkdirSync(dbDir, { recursive: true });
  const secretFile = path.join(dbDir, '.session_secret');

  if (fs.existsSync(secretFile)) {
    const stored = fs.readFileSync(secretFile, 'utf8').trim();
    if (stored.length >= 64) {
      return stored;
    }
  }

  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  if (NODE_ENV === 'production') {
    console.warn(
      '[security] No SESSION_SECRET environment variable configured. Generated and persisted a random secret in data directory.'
    );
  }
  return generated;
}

export const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  port: Number.isFinite(PORT) && PORT > 0 ? PORT : 3000,
  dbPath: DB_PATH,
  sessionSecret: resolveSessionSecret(),
  sessionCookieName: 'cadence_session',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;
