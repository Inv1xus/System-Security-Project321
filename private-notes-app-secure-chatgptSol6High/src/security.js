const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_SALT = '00000000000000000000000000000000';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  const salt = parts.length === 3 && parts[0] === 'scrypt' ? parts[1] : DUMMY_SALT;
  const expected = parts.length === 3 && /^[a-f0-9]{128}$/.test(parts[2])
    ? Buffer.from(parts[2], 'hex') : Buffer.alloc(64);
  const actual = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return crypto.timingSafeEqual(actual, expected) && parts.length === 3;
}

function token() {
  return crypto.randomBytes(32).toString('hex');
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function equalToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = { hashPassword, verifyPassword, token, tokenHash, equalToken };
