import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';
import { db } from './db.ts';
import { verifySignedSessionToken } from './auth.ts';

export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  sessionId?: string;
}

export function extractAuthContext(req: AuthenticatedRequest): void {
  const rawToken = req.cookies?.[config.sessionCookieName];
  if (typeof rawToken !== 'string' || !rawToken) {
    return;
  }

  const sessionId = verifySignedSessionToken(rawToken);
  if (!sessionId) {
    return;
  }

  const row = db
    .prepare(
      `SELECT
         s.id AS session_id,
         s.expires_at,
         u.id,
         u.name,
         u.email,
         u.role,
         u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`
    )
    .get(sessionId, Date.now()) as
    | {
        session_id: string;
        expires_at: number;
        id: number;
        name: string;
        email: string;
        role: UserRole;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return;
  }

  req.sessionId = row.session_id;
  req.authUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function attachAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  extractAuthContext(req);
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  next();
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfOriginProtection(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  const host = req.get('host');

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        res.status(403).json({ error: 'Cross-origin state-changing request rejected.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid Origin header.' });
      return;
    }
  }

  next();
}
