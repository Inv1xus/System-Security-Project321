import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, getSessionSecret } from './db.ts';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const COOKIE_NAME = 'cadence_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface TokenPayload {
  uid: number;
  exp: number;
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSessionToken(userId: number): string {
  const payload: TokenPayload = {
    uid: userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encoded, getSessionSecret());
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, signature] = parts;
  if (!encoded || !signature) {
    return null;
  }

  const expected = signPayload(encoded, getSessionSecret());
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof parsed.uid !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isHttpsRequest(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') {
    return true;
  }
  return req.secure;
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  const secure = isHttpsRequest(req);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req: Request): void {
  const secure = isHttpsRequest(req);
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
  });
}

export function attachUser(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== 'string' || !token) {
    next();
    return;
  }

  const verified = verifySessionToken(token);
  if (!verified) {
    next();
    return;
  }

  const user = db
    .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
    .get(verified.uid) as AuthUser | undefined;

  if (user) {
    req.user = user;
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}
