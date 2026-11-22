'use strict';

const config = require('../config');

class HttpError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.status = status;
    this.expose = true;
    if (code) this.code = code;
  }
}

function bad(message, code) {
  return new HttpError(400, message, code);
}

/** Reject anything that is not a plain JSON object (guards prototype pollution). */
function requireObject(value, what = 'body') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw bad(`Invalid ${what}.`);
  }
  return value;
}

function requireString(value, field, { min = 1, max = 255, trim = true } = {}) {
  if (typeof value !== 'string') throw bad(`"${field}" must be a string.`);
  const s = trim ? value.trim() : value;
  if (s.length < min) throw bad(`"${field}" must be at least ${min} characters.`);
  if (s.length > max) throw bad(`"${field}" must be at most ${max} characters.`);
  // Reject control characters and lone surrogates outright.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) {
    throw bad(`"${field}" contains invalid characters.`);
  }
  return s;
}

function requireInt(value, field, { min, max }) {
  // Only numbers and numeric strings are accepted. Objects and arrays are
  // rejected before any coercion: String({toString: 1}) throws, which would
  // otherwise turn a crafted body into a 500.
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && /^-?\d{1,15}$/.test(value.trim())) {
    n = Number.parseInt(value.trim(), 10);
  } else {
    throw bad(`"${field}" must be an integer.`);
  }
  if (!Number.isInteger(n)) throw bad(`"${field}" must be an integer.`);
  if (n < min || n > max) throw bad(`"${field}" must be between ${min} and ${max}.`);
  return n;
}

function requireId(value, field = 'id') {
  return requireInt(value, field, { min: 1, max: Number.MAX_SAFE_INTEGER });
}

// Deliberately conservative: one @, no spaces, sane label lengths.
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function requireEmail(value) {
  const raw = requireString(value, 'email', { min: 3, max: 254 });
  const email = raw.toLowerCase();
  if (!EMAIL_RE.test(email) || email.includes('..')) {
    throw bad('Enter a valid email address.');
  }
  return email;
}

function requirePassword(value) {
  if (typeof value !== 'string') throw bad('"password" must be a string.');
  // Never trim a password: leading/trailing spaces are legitimate characters.
  if (value.length < config.password.minLength) {
    throw bad(`Password must be at least ${config.password.minLength} characters.`);
  }
  if (value.length > config.password.maxLength) {
    throw bad(`Password must be at most ${config.password.maxLength} characters.`);
  }
  if (/[\u0000]/.test(value)) throw bad('Password contains invalid characters.');
  // Require a little variety without being user-hostile about it.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (classes < 3) {
    throw bad('Password must mix at least three of: lowercase, uppercase, digits, symbols.');
  }
  return value;
}

const ISO_INSTANT_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parse an ISO-8601 instant and return a normalised UTC ISO string.
 * The shape is checked with a regex first: Date.parse also accepts loose,
 * implementation-defined formats such as "12/25/2026", which we do not want.
 */
function requireInstant(value, field) {
  const s = requireString(value, field, { min: 10, max: 40 });
  if (!ISO_INSTANT_RE.test(s)) throw bad(`"${field}" must be an ISO-8601 date-time.`);
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) throw bad(`"${field}" must be an ISO-8601 date-time.`);
  // Keep the schedule inside a believable range.
  const year = new Date(ms).getUTCFullYear();
  if (year < 2000 || year > 2100) throw bad(`"${field}" is out of range.`);
  return new Date(ms).toISOString();
}

module.exports = {
  HttpError,
  bad,
  requireObject,
  requireString,
  requireInt,
  requireId,
  requireEmail,
  requirePassword,
  requireInstant,
};
