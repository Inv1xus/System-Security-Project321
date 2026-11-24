import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { config } from './config.ts';
import { db } from './db.ts';

const BCRYPT_ROUNDS = 12;
// Precomputed dummy bcrypt hash so invalid-email logins take the same CPU time as valid ones
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKxGhu5Q6Q7bH0v0y8l5o5R6hB7J6q5g7z4Oa';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

function signSessionId(sessionId: string): string {
  const signature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(sessionId)
    .digest('hex');
  return `${sessionId}.${signature}`;
}

export function verifySignedSessionToken(token: string): string | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) {
    return null;
  }

  const sessionId = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);

  if (!/^[a-f0-9]{64}$/.test(sessionId) || !/^[a-f0-9]{64}$/.test(providedSig)) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(sessionId)
    .digest('hex');

  const providedBuf = Buffer.from(providedSig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');

  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  return sessionId;
}

export function createSession(userId: number): string {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + config.sessionTtlMs;

  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionId,
    userId,
    expiresAt
  );

  return signSessionId(sessionId);
}

export function revokeSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

export function setSessionCookie(req: Request, res: Response, signedToken: string): void {
  res.cookie(config.sessionCookieName, signedToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: config.sessionTtlMs,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
  });
}
