import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

test('authentication, note CRUD, and user isolation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'private-notes-'));
  const app = createApp({ databasePath: join(directory, 'test.sqlite') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(path, { method = 'GET', cookie, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0]
    };
  }

  try {
    assert.equal((await call('/api/notes')).status, 401);

    const alice = await call('/api/auth/signup', {
      method: 'POST', body: { email: 'Alice@Example.com', password: 'a-long-password' }
    });
    assert.equal(alice.status, 201);
    assert.equal(alice.data.user.email, 'alice@example.com');
    assert.ok(alice.cookie?.startsWith('notes_session='));

    const duplicate = await call('/api/auth/signup', {
      method: 'POST', body: { email: 'alice@example.com', password: 'another-password' }
    });
    assert.equal(duplicate.status, 409);

    const invalidNote = await call('/api/notes', {
      method: 'POST', cookie: alice.cookie, body: { title: ' ', body: 'x' }
    });
    assert.equal(invalidNote.status, 400);

    const created = await call('/api/notes', {
      method: 'POST', cookie: alice.cookie, body: { title: 'First note', body: 'private text' }
    });
    assert.equal(created.status, 201);
    const id = created.data.note.id;
    assert.equal((await call(`/api/notes/${id}`, { cookie: alice.cookie })).data.note.body, 'private text');

    const bob = await call('/api/auth/signup', {
      method: 'POST', body: { email: 'bob@example.com', password: 'another-long-password' }
    });
    assert.equal(bob.status, 201);
    assert.deepEqual((await call('/api/notes', { cookie: bob.cookie })).data.notes, []);
    assert.equal((await call(`/api/notes/${id}`, { cookie: bob.cookie })).status, 404);
    assert.equal((await call(`/api/notes/${id}`, {
      method: 'PUT', cookie: bob.cookie, body: { title: 'Changed', body: 'stolen' }
    })).status, 404);
    assert.equal((await call(`/api/notes/${id}`, {
      method: 'DELETE', cookie: bob.cookie, body: {}
    })).status, 404);

    const updated = await call(`/api/notes/${id}`, {
      method: 'PUT', cookie: alice.cookie, body: { title: 'Updated', body: 'new text' }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.note.body, 'new text');
    assert.equal((await call('/api/notes', { cookie: alice.cookie })).data.notes.length, 1);

    const loggedOut = await call('/api/auth/logout', { method: 'POST', cookie: alice.cookie, body: {} });
    assert.equal(loggedOut.status, 204);
    assert.equal((await call('/api/notes', { cookie: alice.cookie })).status, 401);
    assert.equal((await call('/api/auth/login', {
      method: 'POST', body: { email: 'alice@example.com', password: 'wrong-password' }
    })).status, 401);

    const loggedIn = await call('/api/auth/login', {
      method: 'POST', body: { email: 'alice@example.com', password: 'a-long-password' }
    });
    assert.equal(loggedIn.status, 200);
    assert.equal((await call(`/api/notes/${id}`, {
      method: 'DELETE', cookie: loggedIn.cookie, body: {}
    })).status, 204);
    assert.deepEqual((await call('/api/notes', { cookie: loggedIn.cookie })).data.notes, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    app.locals.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
