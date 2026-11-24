import { statements } from '../db.js';

/** Reject anything that is not an authenticated session. */
export function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // The session may outlive the account; re-check the user on every request.
  const user = statements.findUserById.get(userId);
  if (!user) {
    return req.session.destroy(() =>
      res.status(401).json({ error: 'Authentication required.' })
    );
  }

  req.user = user;
  return next();
}

/**
 * Rebuild the session on privilege change so a pre-login session id cannot be
 * fixated by an attacker and reused after the victim authenticates.
 */
export function loginUser(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.createdAt = Date.now();
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}
