'use strict';

const config = require('../config');
const { HttpError } = require('../lib/validate');
const { csrfMatches } = require('../lib/session');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The origins allowed to send state-changing requests: whatever ALLOWED_ORIGINS
 * names, plus this request's own host under either scheme.
 *
 * Both schemes are accepted because the app cannot reliably tell from inside
 * the container whether a TLS proxy sits in front of it. This is not a weakness:
 * a browser sets Origin from the page that made the request, so a cross-site
 * page can never present this host's origin, and an attacker able to set the
 * header freely is not making a cross-site request in the first place. Set
 * ALLOWED_ORIGINS if you want the list pinned exactly.
 */
function expectedOrigins(req) {
  const origins = new Set(config.allowedOrigins);
  const host = req.headers.host;
  if (host && /^[A-Za-z0-9._:\[\]-]{1,255}$/.test(host)) {
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
  return origins;
}

/**
 * Two independent CSRF defences for every state-changing request:
 *
 *  1. The Origin / Referer header must match this site. Browsers set these and
 *     scripts cannot forge them, so cross-site form posts are rejected even
 *     before authentication is considered.
 *  2. Authenticated requests must also carry the per-session synchroniser token
 *     in X-CSRF-Token. SameSite=Strict cookies make this belt-and-braces.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowed = expectedOrigins(req);

  if (origin && origin !== 'null') {
    if (!allowed.has(origin)) {
      return next(new HttpError(403, 'Cross-site request blocked.', 'csrf_origin'));
    }
  } else if (referer) {
    let refOrigin;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      return next(new HttpError(403, 'Cross-site request blocked.', 'csrf_origin'));
    }
    if (!allowed.has(refOrigin)) {
      return next(new HttpError(403, 'Cross-site request blocked.', 'csrf_origin'));
    }
  } else {
    // No Origin and no Referer: only tolerated for the unauthenticated
    // sign-in / sign-up endpoints, which hold no privileges to abuse.
    if (req.user) {
      return next(new HttpError(403, 'Cross-site request blocked.', 'csrf_origin'));
    }
  }

  if (req.user) {
    const presented = req.get('x-csrf-token');
    if (!csrfMatches(req, presented)) {
      return next(new HttpError(403, 'Invalid or missing CSRF token.', 'csrf_token'));
    }
  }

  return next();
}

module.exports = { csrfProtection };
