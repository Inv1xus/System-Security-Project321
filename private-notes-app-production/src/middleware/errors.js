import { ValidationError } from './validate.js';

export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  return res.status(404).type('text/plain').send('Not found');
}

/* eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature */
export function errorHandler(err, req, res, next) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, field: err.field });
  }

  // Body parser errors (malformed JSON, payload too large).
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }

  // Anything else is unexpected: log server-side, return an opaque message so
  // stack traces and internals never reach the client.
  console.error('[error]', err);
  return res.status(500).json({ error: 'Internal server error.' });
}
