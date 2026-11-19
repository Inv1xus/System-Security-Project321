'use strict';

const crypto = require('node:crypto');

/** 256 bits of CSPRNG entropy, URL-safe. */
function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Session and CSRF tokens are stored only as SHA-256 digests, so a dump of the
 * database cannot be replayed as a live session. The tokens are already
 * high-entropy random values, so a plain digest (no KDF) is appropriate.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { randomToken, hashToken, timingSafeEqualStr };
