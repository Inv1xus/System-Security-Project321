'use strict';

const { HttpError } = require('../lib/validate');

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'You must be signed in.', 'unauthenticated'));
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'You must be signed in.', 'unauthenticated'));
  // Role comes from the database on every request, never from the cookie or body.
  if (req.user.role !== 'admin') {
    return next(new HttpError(403, 'Administrator access required.', 'forbidden'));
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
