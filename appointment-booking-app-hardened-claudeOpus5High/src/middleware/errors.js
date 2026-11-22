'use strict';

const config = require('../config');
const { HttpError } = require('../lib/validate');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

/**
 * Single JSON error responder. Only messages that were deliberately marked as
 * safe to expose reach the client; everything else becomes a generic 500 and is
 * logged server-side, so stack traces and SQL text never leak.
 */
function errorHandler(err, req, res, _next) {
  // Trust the status of our own HttpError and of body-parser errors; anything
  // else (an unexpected throw) is reported as a generic 500.
  const raw = Number(err && (err.status || err.statusCode));
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  const safeMessage =
    err instanceof HttpError
      ? String(err.message)
      : status === 413
        ? 'Request body too large.'
        : status === 400
          ? 'Malformed request.'
          : 'Request rejected.';

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  }

  if (res.headersSent) {
    res.destroy();
    return;
  }

  const body = { error: status >= 500 ? 'Something went wrong.' : safeMessage };
  if (err instanceof HttpError && err.code) body.code = err.code;
  if (status === 429 && err.retryAfterSeconds) {
    res.set('Retry-After', String(err.retryAfterSeconds));
  }
  if (!config.isProd && status >= 500 && err && err.message) {
    body.detail = String(err.message);
  }
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
