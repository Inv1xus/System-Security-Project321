import crypto from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER = 'x-csrf-token';

function issueToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  }
  return req.session.csrfToken;
}

function sameString(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Synchronizer-token CSRF protection. The token lives in the server-side
 * session and must be echoed in a custom header, which cross-origin HTML forms
 * cannot set. This backs up the SameSite=Strict session cookie.
 */
export function csrfProtection(req, res, next) {
  const token = issueToken(req);
  res.locals.csrfToken = token;

  if (SAFE_METHODS.has(req.method)) return next();

  const presented = req.get(HEADER) || '';
  if (!presented || !sameString(presented, token)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
  }
  return next();
}

export function csrfTokenHandler(req, res) {
  res.json({ csrfToken: res.locals.csrfToken });
}
