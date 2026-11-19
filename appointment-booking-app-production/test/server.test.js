import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { bootstrapAdmin, createApp } from '../src/server.js';

test('signup, admin slots, booking ownership, cancellation, and conflicts', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'booking-test-'));
  const db = openDatabase(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  bootstrapAdmin(db, 'admin@example.com', 'strong-admin-password');
  const server = createApp({ db, secureCookie: false }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(origin);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(origin + '/api/signup', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bad@example.com', password: 'long-enough-password' })
  })).status, 403);

  async function api(path, { method = 'GET', body, auth } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrfToken } : {})
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {})
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }

  const adminLogin = await api('/api/login', { method: 'POST', body: { email: 'admin@example.com', password: 'strong-admin-password' } });
  assert.equal(adminLogin.status, 200);
  const admin = { cookie: adminLogin.cookie, csrfToken: adminLogin.data.csrfToken };
  const aliceSignup = await api('/api/signup', { method: 'POST', body: { email: 'alice@example.com', password: 'alice-password-123' } });
  assert.equal(aliceSignup.status, 201);
  const alice = { cookie: aliceSignup.cookie, csrfToken: aliceSignup.data.csrfToken };
  const bobSignup = await api('/api/signup', { method: 'POST', body: { email: 'bob@example.com', password: 'bob-password-12345' } });
  const bob = { cookie: bobSignup.cookie, csrfToken: bobSignup.data.csrfToken };

  assert.equal((await api('/api/admin/bookings', { auth: alice })).status, 403);
  assert.equal((await api('/api/admin/slots', { method: 'POST', auth: alice, body: {} })).status, 403);
  const start = new Date(Date.now() + 24 * 3600000);
  const end = new Date(start.getTime() + 30 * 60000);
  const added = await api('/api/admin/slots', { method: 'POST', auth: admin, body: { startsAt: start.toISOString(), endsAt: end.toISOString() } });
  assert.equal(added.status, 201);
  const slotId = added.data.id;
  assert.equal((await fetch(origin + '/api/bookings', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: alice.cookie },
    body: JSON.stringify({ slotId })
  })).status, 403);
  assert.equal((await api('/api/admin/slots', { method: 'POST', auth: admin, body: { startsAt: start.toISOString(), endsAt: end.toISOString() } })).status, 409);
  assert.equal((await api('/api/slots', { auth: alice })).data.slots.length, 1);

  assert.equal((await api('/api/bookings', { method: 'POST', auth: alice, body: { slotId } })).status, 201);
  assert.equal((await api('/api/bookings', { method: 'POST', auth: bob, body: { slotId } })).status, 409);
  assert.equal((await api('/api/admin/slots/' + slotId, { method: 'DELETE', auth: admin })).status, 409);
  const aliceBooking = (await api('/api/bookings', { auth: alice })).data.bookings[0];
  assert.equal((await api('/api/bookings/' + aliceBooking.id, { method: 'DELETE', auth: bob })).status, 404);
  assert.equal((await api('/api/bookings/' + aliceBooking.id, { method: 'DELETE', auth: alice })).status, 200);
  assert.equal((await api('/api/bookings', { method: 'POST', auth: bob, body: { slotId } })).status, 201);
  assert.equal((await api('/api/bookings', { auth: alice })).data.bookings[0].cancelledAt !== null, true);
  assert.equal((await api('/api/admin/bookings', { auth: admin })).data.bookings.length, 2);
  assert.equal((await api('/api/bookings', { method: 'POST', auth: alice, body: { slotId: 9999 }, })).status, 409);
  assert.equal((await api('/api/logout', { method: 'POST', auth: alice })).status, 200);
  assert.equal((await api('/api/bookings', { auth: alice })).status, 401);
});

test('repeated login attempts are throttled', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'booking-limit-test-'));
  const db = openDatabase(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const server = createApp({ db, secureCookie: false }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 10; i++) {
    const response = await fetch(origin + '/api/login', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'target@example.com', password: 'wrong-password' })
    });
    assert.equal(response.status, 401);
  }
  const blocked = await fetch(origin + '/api/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'target@example.com', password: 'wrong-password' })
  });
  assert.equal(blocked.status, 429);
});

test('example admin password is rejected', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'booking-config-test-'));
  const db = openDatabase(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.throws(() => bootstrapAdmin(db, 'admin@example.com', 'replace-with-a-long-unique-password'));
});
