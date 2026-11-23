'use strict';

/**
 * Redirect unauthenticated requests to /login.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

/**
 * Redirect already-authenticated users away from guest-only pages.
 */
function requireGuest(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/notes');
  }
  next();
}

module.exports = { requireAuth, requireGuest };
