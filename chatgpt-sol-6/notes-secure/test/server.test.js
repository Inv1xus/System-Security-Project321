const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/server');

test('accounts, note isolation, CSRF, and logout', async () => {
  const db = openDatabase(':memory:');
  const server = createApp(db, { secureCookies: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function api(path, { method = 'GET', body, cookie, csrf, requestOrigin = origin } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers['X-CSRF-Token'] = csrf;
    if (method !== 'GET') headers.Origin = requestOrigin;
    const response = await fetch(origin + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = response.status === 204 ? null : await response.json();
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const alice = await api('/api/signup', { method: 'POST', body: { email: 'Alice@Example.com', password: 'long secure password 1' } });
    assert.equal(alice.response.status, 201);
    assert.equal(alice.data.user.email, 'alice@example.com');
    assert.match(alice.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(alice.response.headers.get('set-cookie'), /SameSite=Strict/);
    assert.match(alice.response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(db.prepare('SELECT password_hash FROM users WHERE email = ?').get('alice@example.com').password_hash, /^scrypt\$/);
    const bob = await api('/api/signup', { method: 'POST', body: { email: 'bob@example.com', password: 'long secure password 2' } });
    assert.equal(bob.response.status, 201);

    const forged = await api('/api/notes', { method: 'POST', cookie: alice.cookie, csrf: alice.data.csrfToken,
      requestOrigin: 'https://attacker.example', body: { title: 'Secret', body: 'Alice only' } });
    assert.equal(forged.response.status, 403);
    const missingCsrf = await api('/api/notes', { method: 'POST', cookie: alice.cookie,
      body: { title: 'Secret', body: 'Alice only' } });
    assert.equal(missingCsrf.response.status, 403);

    const created = await api('/api/notes', { method: 'POST', cookie: alice.cookie, csrf: alice.data.csrfToken,
      body: { title: 'Secret', body: 'Alice only' } });
    assert.equal(created.response.status, 201);
    const id = created.data.note.id;
    assert.equal((await api('/api/notes', { cookie: bob.cookie })).data.notes.length, 0);
    assert.equal((await api(`/api/notes/${id}`, { cookie: bob.cookie })).response.status, 404);
    assert.equal((await api(`/api/notes/${id}`, { method: 'PUT', cookie: bob.cookie, csrf: bob.data.csrfToken,
      body: { title: 'Stolen', body: 'No' } })).response.status, 404);
    assert.equal((await api(`/api/notes/${id}`, { method: 'DELETE', cookie: bob.cookie, csrf: bob.data.csrfToken,
      body: {} })).response.status, 404);
    assert.equal((await api(`/api/notes/${id}`, { cookie: alice.cookie })).data.note.title, 'Secret');

    const updated = await api(`/api/notes/${id}`, { method: 'PUT', cookie: alice.cookie, csrf: alice.data.csrfToken,
      body: { title: 'Revised', body: 'New text' } });
    assert.equal(updated.data.note.title, 'Revised');
    assert.equal((await api(`/api/notes/${id}`, { method: 'DELETE', cookie: alice.cookie,
      csrf: alice.data.csrfToken, body: {} })).response.status, 204);
    assert.equal((await api(`/api/notes/${id}`, { cookie: alice.cookie })).response.status, 404);

    assert.equal((await api('/api/logout', { method: 'POST', cookie: alice.cookie,
      csrf: alice.data.csrfToken, body: {} })).response.status, 204);
    assert.equal((await api('/api/me', { cookie: alice.cookie })).response.status, 401);
    const login = await api('/api/login', { method: 'POST', body: { email: 'alice@example.com', password: 'long secure password 1' } });
    assert.equal(login.response.status, 200);
    assert.equal((await api('/api/me', { cookie: login.cookie })).response.status, 200);
    for (let attempt = 0; attempt < 7; attempt++) {
      assert.equal((await api('/api/login', { method: 'POST', body: {
        email: 'alice@example.com', password: 'wrong password 123'
      } })).response.status, 401);
    }
    assert.equal((await api('/api/login', { method: 'POST', body: {
      email: 'alice@example.com', password: 'wrong password 123'
    } })).response.status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
