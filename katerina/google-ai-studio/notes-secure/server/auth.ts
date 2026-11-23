import crypto from 'node:crypto';
import type { CookieOptions, Request } from 'express';
import { db } from './db.ts';

export const SESSION_COOKIE_NAME = 'folio_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

// Pre-computed dummy scrypt hash used to equalize login response timing when user does not exist
const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export interface AuthUser {
  id: string;
  username: string;
}

export interface SessionRecord {
  user: AuthUser;
  csrfToken: string;
  tokenHash: string;
  expiresAt: number;
}

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedHex) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (expectedBuf.length === 0) {
    return false;
  }

  const derived = await scryptAsync(password, salt, expectedBuf.length, { N: n, r, p });
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export async function runDummyPasswordCheck(password: string): Promise<void> {
  try {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
  } catch {
    // Ignore result; solely used for timing equalization
  }
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): {
  sessionToken: string;
  csrfToken: string;
  expiresAt: number;
} {
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(sessionToken);
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(tokenHash, userId, csrfToken, expiresAt, now);

  return { sessionToken, csrfToken, expiresAt };
}

export function getSessionByToken(sessionToken: string): SessionRecord | null {
  if (!sessionToken || typeof sessionToken !== 'string') {
    return null;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const row = db
    .prepare(
      `SELECT s.token_hash, s.csrf_token, s.expires_at, u.id AS user_id, u.username
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        token_hash: string;
        csrf_token: string;
        expires_at: number;
        user_id: string;
        username: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    user: {
      id: row.user_id,
      username: row.username,
    },
    csrfToken: row.csrf_token,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
  };
}

export function deleteSessionByHash(tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function getSessionCookieOptions(req: Request): CookieOptions {
  const isHttps = req.secure;
  const envSameSite = process.env.COOKIE_SAME_SITE?.toLowerCase();

  let sameSite: 'lax' | 'strict' | 'none';
  if (envSameSite === 'strict' || envSameSite === 'lax' || envSameSite === 'none') {
    sameSite = envSameSite;
  } else {
    // Over HTTPS (e.g. reverse proxy or embedded preview), SameSite=None + Secure allows iframe sessions
    // while CSRF token validation protects all mutating endpoints. Over local HTTP, Lax is required.
    sameSite = isHttps ? 'none' : 'lax';
  }

  return {
    httpOnly: true,
    secure: sameSite === 'none' ? true : isHttps,
    sameSite,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}
