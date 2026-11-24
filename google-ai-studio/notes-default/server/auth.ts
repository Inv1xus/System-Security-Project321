import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'vaultnotes-private-notes-secret-key-2026';
export const TOKEN_COOKIE_NAME = 'vaultnotes_token';

export interface AuthUser {
  id: number;
  username: string;
  email?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  let token = req.cookies?.[TOKEN_COOKIE_NAME];

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    
    // Verify user still exists in database
    const userRow = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(decoded.id) as AuthUser | undefined;
    if (!userRow) {
      res.status(401).json({ error: 'User account not found.' });
      return;
    }

    req.user = userRow;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}
