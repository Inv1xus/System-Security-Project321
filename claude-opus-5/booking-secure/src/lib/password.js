'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * Using the built-in KDF avoids a native build step while still giving a
 * memory-hard hash. Parameters are stored alongside the digest so that they can
 * be raised later without invalidating existing accounts.
 *
 * N = 2^15 (32 MiB, ~100 ms per hash) is the scrypt paper's interactive-login
 * parameter set: a deliberate balance. Raising it strengthens offline cracking
 * resistance but also multiplies what an attacker costs us per login attempt,
 * which is the more likely threat for a single-container deployment. The login
 * rate limit and the per-account lockout are the other half of that defence.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
// scrypt needs roughly 128 * N * r bytes of memory; raise the default 32 MiB cap.
const MAX_MEM = 192 * 1024 * 1024;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, PARAMS.keylen, { ...PARAMS, maxmem: MAX_MEM });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

async function verifyPassword(password, stored) {
  // Always do the work, even for malformed records, so failures cost the same.
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await scrypt('', crypto.randomBytes(16), PARAMS.keylen, { ...PARAMS, maxmem: MAX_MEM });
    return false;
  }

  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N < 2 ** 12 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  if (salt.length === 0 || expected.length === 0 || expected.length > 256) return false;

  const derived = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  return crypto.timingSafeEqual(derived, expected);
}

module.exports = { hashPassword, verifyPassword };
