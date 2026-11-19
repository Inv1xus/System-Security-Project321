'use strict';

/**
 * End-to-end tests over real HTTP against an in-memory database.
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apt-test-')), 'test.db');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = dbPath;
process.env.SECURE_COOKIES = 'never';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'Admin-Password-123!';
// Raise the per-IP request ceilings: every test client shares 127.0.0.1, so the
// production limits would throttle the functional assertions themselves.
process.env.RATE_LIMIT_GLOBAL_PER_MINUTE = '100000';
process.env.RATE_LIMIT_LOGIN_PER_15MIN = '100000';
process.env.RATE_LIMIT_SIGNUP_PER_HOUR = '100000';

const { createApp } = require('../src/app');
const { getDb, close } = require('../src/db');
const { hashPassword } = require('../src/lib/password');

const USER = { email: 'user@example.com', password: 'User-Password-123!' };
const ADMIN = { email: 'admin@example.com', password: 'Admin-Password-123!' };

let server;
let base;

test.before(async () => {
  const db = getDb();
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')").run(
    ADMIN.email,
    await hashPassword(ADMIN.password),
  );
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

/** Minimal cookie-jar client. */
function client() {
  const jar = new Map();
  let csrf = null;

  async function call(method, pathname, body, extraHeaders = {}) {
    const headers = { Origin: base, ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
    if (jar.size) {
      headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const res = await fetch(base + pathname, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /expires=thu, 01 jan 1970/i.test(raw)) jar.delete(name);
      else jar.set(name, value);
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (json && json.csrfToken) csrf = json.csrfToken;
    return { status: res.status, body: json, headers: res.headers };
  }

  return {
    call,
    get: (p) => call('GET', p),
    post: (p, b, h) => call('POST', p, b, h),
    del: (p) => call('DELETE', p),
    jar,
    setCsrf: (v) => {
      csrf = v;
    },
    get csrf() {
      return csrf;
    },
  };
}

function soon(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

test('health endpoint is public', async () => {
  const res = await client().get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('sign-up rejects weak passwords', async () => {
  const res = await client().post('/api/auth/signup', { email: 'weak@example.com', password: 'short' });
  assert.equal(res.status, 400);
});

test('sign-up cannot self-assign the admin role', async () => {
  const c = client();
  const res = await c.post('/api/auth/signup', { ...USER, role: 'admin' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'user');
});

test('duplicate sign-up is refused', async () => {
  const res = await client().post('/api/auth/signup', USER);
  assert.equal(res.status, 409);
});

test('login with a wrong password fails generically', async () => {
  const res = await client().post('/api/auth/login', { email: USER.email, password: 'Wrong-Password-1!' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid email or password.');
});

test('unknown account returns the same error as a wrong password', async () => {
  const res = await client().post('/api/auth/login', { email: 'nobody@example.com', password: 'Wrong-Password-1!' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid email or password.');
});

test('api requires authentication', async () => {
  assert.equal((await client().get('/api/slots')).status, 401);
  assert.equal((await client().get('/api/bookings')).status, 401);
  assert.equal((await client().get('/api/admin/bookings')).status, 401);
});

test('session cookie is HttpOnly, SameSite=Strict', async () => {
  const c = client();
  const res = await c.post('/api/auth/login', USER);
  assert.equal(res.status, 200);
  const cookies = res.headers.getSetCookie().join('\n');
  const sid = res.headers.getSetCookie().find((x) => x.startsWith('sid='));
  assert.ok(/HttpOnly/i.test(sid), 'sid must be HttpOnly');
  assert.ok(/SameSite=Strict/i.test(cookies), 'cookies must be SameSite=Strict');
});

test('login rotates the session identifier (no fixation)', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  const first = c.jar.get('sid');
  await c.post('/api/auth/login', USER);
  assert.notEqual(c.jar.get('sid'), first);
});

test('a non-admin cannot reach admin endpoints', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  assert.equal((await c.get('/api/admin/bookings')).status, 403);
  assert.equal((await c.get('/api/admin/slots')).status, 403);
  assert.equal((await c.post('/api/admin/slots', { startsAt: soon(60) })).status, 403);
});

test('state-changing requests need a valid CSRF token', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  const good = c.csrf;

  c.setCsrf('not-the-right-token');
  assert.equal((await c.post('/api/bookings', { slotId: 1 })).status, 403);

  c.setCsrf(null);
  assert.equal((await c.post('/api/bookings', { slotId: 1 })).status, 403);

  c.setCsrf(good);
});

test('cross-site origins are blocked', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  const res = await c.post('/api/bookings', { slotId: 1 }, { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('admin can add slots and users can book them', async () => {
  const admin = client();
  await admin.post('/api/auth/login', ADMIN);

  const created = await admin.post('/api/admin/slots', {
    startsAt: soon(120),
    durationMinutes: 30,
    capacity: 1,
  });
  assert.equal(created.status, 201);
  const slotId = created.body.slot.id;

  const user = client();
  await user.post('/api/auth/login', USER);

  const list = await user.get('/api/slots');
  assert.equal(list.status, 200);
  assert.ok(list.body.slots.some((s) => s.id === slotId));

  const booked = await user.post('/api/bookings', { slotId });
  assert.equal(booked.status, 201);

  // Same user, same slot - refused.
  assert.equal((await user.post('/api/bookings', { slotId })).status, 409);

  // Capacity of one is now exhausted for everybody else.
  const other = client();
  await other.post('/api/auth/signup', { email: 'other@example.com', password: 'Other-Password-123!' });
  assert.equal((await other.post('/api/bookings', { slotId })).status, 409);

  const mine = await user.get('/api/bookings');
  assert.equal(mine.body.bookings.length, 1);
  const bookingId = mine.body.bookings[0].id;

  // Another user cannot cancel somebody else's booking.
  assert.equal((await other.del(`/api/bookings/${bookingId}`)).status, 404);

  assert.equal((await user.del(`/api/bookings/${bookingId}`)).status, 200);
  assert.equal((await user.del(`/api/bookings/${bookingId}`)).status, 409);

  // Freed up again.
  assert.equal((await other.post('/api/bookings', { slotId })).status, 201);
});

test('booking a past slot is refused', async () => {
  const admin = client();
  await admin.post('/api/auth/login', ADMIN);
  const db = getDb();
  const info = db
    .prepare('INSERT INTO slots (starts_at, ends_at, capacity) VALUES (?, ?, 1)')
    .run(soon(-120), soon(-90));

  const user = client();
  await user.post('/api/auth/login', USER);
  const res = await user.post('/api/bookings', { slotId: Number(info.lastInsertRowid) });
  assert.equal(res.status, 409);
});

test('admin slot validation rejects bad input', async () => {
  const admin = client();
  await admin.post('/api/auth/login', ADMIN);

  assert.equal((await admin.post('/api/admin/slots', { startsAt: 'not-a-date' })).status, 400);
  assert.equal(
    (await admin.post('/api/admin/slots', { startsAt: soon(400), durationMinutes: 1 })).status,
    400,
  );
  assert.equal(
    (await admin.post('/api/admin/slots', { startsAt: soon(400), capacity: 99999 })).status,
    400,
  );
  // Overlapping an existing slot.
  await admin.post('/api/admin/slots', { startsAt: soon(500), durationMinutes: 60 });
  assert.equal(
    (await admin.post('/api/admin/slots', { startsAt: soon(530), durationMinutes: 60 })).status,
    409,
  );
});

test('removing a booked slot requires force and cancels the bookings', async () => {
  const admin = client();
  await admin.post('/api/auth/login', ADMIN);
  const created = await admin.post('/api/admin/slots', {
    startsAt: soon(1000),
    durationMinutes: 30,
    capacity: 2,
  });
  const slotId = created.body.slot.id;

  const user = client();
  await user.post('/api/auth/login', USER);
  assert.equal((await user.post('/api/bookings', { slotId })).status, 201);

  assert.equal((await admin.del(`/api/admin/slots/${slotId}`)).status, 409);
  const forced = await admin.del(`/api/admin/slots/${slotId}?force=true`);
  assert.equal(forced.status, 200);
  assert.equal(forced.body.cancelledBookings, 1);

  const mine = await user.get('/api/bookings?includeCancelled=true');
  assert.ok(mine.body.bookings.every((b) => b.slotId !== slotId));
});

test('admin sees all bookings with user emails', async () => {
  const admin = client();
  await admin.post('/api/auth/login', ADMIN);
  const res = await admin.get('/api/admin/bookings?includeCancelled=true');
  assert.equal(res.status, 200);
  assert.ok(res.body.bookings.length > 0);
  assert.ok(res.body.bookings.every((b) => typeof b.user.email === 'string'));
});

test('logout destroys the session', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  assert.equal((await c.get('/api/bookings')).status, 200);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/bookings')).status, 401);
});

test('a forged session cookie is rejected', async () => {
  const c = client();
  c.jar.set('sid', 'a'.repeat(43));
  const res = await c.get('/api/bookings');
  assert.equal(res.status, 401);
});

test('oversized bodies and nested payloads are rejected', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  const big = await c.post('/api/bookings', { slotId: 1, pad: 'x'.repeat(40_000) });
  assert.equal(big.status, 413);
  const nested = await c.post('/api/bookings', { slotId: { toString: 1 } });
  assert.equal(nested.status, 400);
});

test('security headers are present on the page', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp && csp.includes("default-src 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('password change invalidates existing sessions', async () => {
  const c = client();
  const email = 'rotate@example.com';
  await c.post('/api/auth/signup', { email, password: 'Rotate-Password-1!' });
  assert.equal((await c.get('/api/bookings')).status, 200);

  assert.equal(
    (await c.post('/api/auth/password', { currentPassword: 'wrong', newPassword: 'Another-Password-9!' }))
      .status,
    403,
  );
  assert.equal(
    (await c.post('/api/auth/password', {
      currentPassword: 'Rotate-Password-1!',
      newPassword: 'Another-Password-9!',
    })).status,
    200,
  );
  assert.equal((await c.get('/api/bookings')).status, 401);

  const again = client();
  assert.equal((await again.post('/api/auth/login', { email, password: 'Another-Password-9!' })).status, 200);
});

test('api responses are not cacheable', async () => {
  const c = client();
  await c.post('/api/auth/login', USER);
  const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `sid=${c.jar.get('sid')}` } });
  assert.match(res.headers.get('cache-control'), /no-store/);
});

test('me reports no user when signed out', async () => {
  const res = await client().get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.user, null);
  assert.equal(res.body.csrfToken, null);
});

test('loose date formats are rejected, ISO-8601 is accepted', async () => {
  const admin = client();
  await admin.post('/api/auth/login', ADMIN);
  assert.equal((await admin.post('/api/admin/slots', { startsAt: '12/25/2030' })).status, 400);
  assert.equal((await admin.post('/api/admin/slots', { startsAt: 'Dec 25 2030' })).status, 400);
  assert.equal((await admin.post('/api/admin/slots', { startsAt: soon(5000) })).status, 201);
});

test('repeated failed logins lock the account', async () => {
  const email = 'lockme@example.com';
  const password = 'Lockme-Password-1!';
  await client().post('/api/auth/signup', { email, password });

  for (let i = 0; i < 8; i += 1) {
    await client().post('/api/auth/login', { email, password: 'Definitely-Wrong-1!' });
  }
  // Correct password, but the account is temporarily locked.
  assert.equal((await client().post('/api/auth/login', { email, password })).status, 401);
  const row = getDb().prepare('SELECT locked_until FROM users WHERE email = ?').get(email);
  assert.ok(row.locked_until && Date.parse(row.locked_until) > Date.now());
});
