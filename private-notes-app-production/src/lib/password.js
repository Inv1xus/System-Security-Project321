import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// OWASP-listed scrypt configuration: N=2^16, r=8, p=2 (~64 MB per hash).
// Memory-hardness is what makes GPU/ASIC cracking expensive, so this is a
// substantially stronger choice than PBKDF2 at comparable CPU cost.
const PARAMS = { N: 65536, r: 8, p: 2, keylen: 64, maxmem: 256 * 1024 * 1024 };
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

/** Hash a plaintext password into a self-describing string safe to store. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, PARAMS);
  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Constant-time verification. Never throws on malformed input; returns false. */
export async function verifyPassword(password, stored) {
  try {
    const [prefix, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (prefix !== PREFIX) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Burn a comparable amount of CPU when the account does not exist, so that
 * response timing does not reveal which emails are registered.
 */
export async function fakeVerify() {
  await scrypt('dummy-password-for-timing', crypto.randomBytes(SALT_BYTES), PARAMS.keylen, PARAMS);
  return false;
}
