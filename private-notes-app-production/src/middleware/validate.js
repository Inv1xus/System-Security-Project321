import { config } from '../config.js';

const { limits } = config;

// Deliberately conservative: one @, no whitespace, a dotted domain.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.field = field;
  }
}

function asString(value, field) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`, field);
  }
  // Strip control characters except tab/newline/carriage return.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function validateEmail(raw) {
  const email = asString(raw, 'email').trim();
  if (email.length === 0) throw new ValidationError('Email is required.', 'email');
  if (email.length > limits.emailMax) {
    throw new ValidationError('Email is too long.', 'email');
  }
  if (!EMAIL_RE.test(email)) {
    throw new ValidationError('Enter a valid email address.', 'email');
  }
  return { email, emailNorm: email.toLowerCase() };
}

export function validatePassword(raw) {
  if (typeof raw !== 'string') {
    throw new ValidationError('Password must be a string.', 'password');
  }
  const password = raw.normalize('NFKC');
  if (password.length < limits.passwordMin) {
    throw new ValidationError(
      `Password must be at least ${limits.passwordMin} characters.`,
      'password'
    );
  }
  if (password.length > limits.passwordMax) {
    throw new ValidationError(
      `Password must be at most ${limits.passwordMax} characters.`,
      'password'
    );
  }
  if (/^\s+$|^(.)\1*$/.test(password)) {
    throw new ValidationError('Choose a less predictable password.', 'password');
  }
  return password;
}

export function validateNote(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object.', 'body');
  }

  const title = asString(body.title ?? '', 'title').trim();
  const content = asString(body.content ?? '', 'content');

  if (title.length === 0) throw new ValidationError('Title is required.', 'title');
  if (title.length > limits.titleMax) {
    throw new ValidationError(`Title must be at most ${limits.titleMax} characters.`, 'title');
  }
  if (content.length > limits.contentMax) {
    throw new ValidationError(
      `Note must be at most ${limits.contentMax} characters.`,
      'content'
    );
  }
  return { title, content };
}

/** Note ids come from the URL; accept only positive integers. */
export function validateId(raw) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(raw ?? ''))) {
    throw new ValidationError('Invalid note id.', 'id');
  }
  return Number(raw);
}
