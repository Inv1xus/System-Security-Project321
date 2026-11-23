import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getSessionByToken, SESSION_COOKIE_NAME, type SessionRecord } from './auth.ts';

export interface AuthenticatedRequest extends Request {
  auth?: SessionRecord;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = getSessionByToken(rawToken);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  req.auth = session;
  next();
}

export function requireCsrf(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const session = req.auth;
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const provided = req.get('x-csrf-token');
  if (typeof provided !== 'string' || provided.length === 0) {
    res.status(403).json({ error: 'Missing CSRF token' });
    return;
  }

  const expectedBuf = Buffer.from(session.csrfToken, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}
