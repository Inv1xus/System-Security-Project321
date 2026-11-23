'use strict';

/**
 * Minimal session-bound CSRF protection (Synchronizer Token Pattern).
 *
 * - On every request a CSRF token is read from (or generated into) the session.
 * - For unsafe methods (POST/PUT/PATCH/DELETE) the submitted `_csrf` body field
 *   must match the session token; otherwise the request is rejected with 403.
 * - `req.csrfToken()` returns the current token so views can embed it.
 */

const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const TOKEN_BYTES = 32; // 256-bit token

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/** Express middleware */
function csrfMiddleware(req, res, next) {
  // Ensure the session has a CSRF token (requires a session to exist)
  if (req.session) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = generateToken();
    }
  }

  // Expose csrfToken() helper used in views / route handlers
  req.csrfToken = function () {
    return (req.session && req.session.csrfToken) || '';
  };

  // Skip validation for safe HTTP methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Validate for all mutating requests
  const submitted = req.body && req.body._csrf;
  const expected = req.session && req.session.csrfToken;

  if (!submitted || !expected) {
    return _reject(res);
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(submitted, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return _reject(res);
  }

  // Rotate the token after successful validation to prevent token-fixation
  req.session.csrfToken = generateToken();

  next();
}

function _reject(res) {
  // Ensure view locals are available even when session/csrf isn't established
  if (!res.locals.csrfToken) res.locals.csrfToken = '';
  if (!res.locals.currentUser) res.locals.currentUser = null;
  res.status(403).render('error', {
    message: 'Invalid or expired form submission. Please go back and try again.',
  });
}

module.exports = csrfMiddleware;
