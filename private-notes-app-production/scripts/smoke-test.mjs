/**
 * End-to-end smoke test. Boots the real app against a throwaway database and
 * exercises auth, per-user isolation, CSRF and validation.
 *
 *   npm run smoke
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-smoke-'));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'smoke-test-secret-value-at-least-32-chars';
process.env.COOKIE_SECURE = 'false';

const { createApp } = await import('../src/app.js');
const { closeDatabase } = await import('../src/db.js');

const app = createApp();
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Minimal cookie jar so each client behaves like a separate browser. */
function newClient() {
  const jar = new Map();
  let csrf = null;

  async function request(pathname, { method = 'GET', body, headers = {}, withCsrf = true } = {}) {
    const hdrs = { Accept: 'application/json', ...headers };
    if (jar.size) {
      hdrs.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (body !== undefined) hdrs['Content-Type'] = 'application/json';
    if (withCsrf && method !== 'GET' && csrf) hdrs['X-CSRF-Token'] = csrf;

    const res = await fetch(base + pathname, {
      method,
      headers: hdrs,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '') jar.delete(name);
      else jar.set(name, value);
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* 204 or non-JSON */
    }
    return { status: res.status, json, headers: res.headers };
  }

  return {
    request,
    jar,
    async csrfToken() {
      const res = await request('/api/csrf');
      csrf = res.json.csrfToken;
      return csrf;
    },
    get token() {
      return csrf;
    },
    setToken(value) {
      csrf = value;
    },
  };
}

try {
  console.log('\nHealth and headers');
  const anon = newClient();
  const health = await anon.request('/healthz');
  check('GET /healthz returns ok', health.status === 200 && health.json.status === 'ok');
  check(
    'CSP header is present and restrictive',
    (health.headers.get('content-security-policy') || '').includes("default-src 'none'")
  );
  check('X-Powered-By is hidden', health.headers.get('x-powered-by') === null);

  console.log('\nAuthentication');
  await anon.csrfToken();
  const unauth = await anon.request('/api/notes');
  check('notes require a session', unauth.status === 401);

  const weak = await anon.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'alice@example.com', password: 'short' },
  });
  check('short passwords are rejected', weak.status === 400, JSON.stringify(weak.json));

  const badEmail = await anon.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'not-an-email', password: 'correct horse battery staple' },
  });
  check('malformed emails are rejected', badEmail.status === 400);

  const alice = newClient();
  await alice.csrfToken();
  const aliceSignup = await alice.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'alice@example.com', password: 'correct horse battery staple' },
  });
  check('signup succeeds', aliceSignup.status === 201, JSON.stringify(aliceSignup.json));

  const dup = newClient();
  await dup.csrfToken();
  const dupRes = await dup.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'ALICE@example.com', password: 'another good passphrase here' },
  });
  check('duplicate email (case-insensitive) is refused', dupRes.status === 409);

  const sidAfterSignup = alice.jar.get('sid');
  await alice.csrfToken();
  const me = await alice.request('/api/auth/me');
  check('session identifies the user', me.status === 200 && me.json.user.email === 'alice@example.com');

  console.log('\nCSRF');
  const noToken = await alice.request('/api/notes', {
    method: 'POST',
    body: { title: 'x', content: 'y' },
    withCsrf: false,
  });
  check('state-changing request without CSRF token is blocked', noToken.status === 403);

  const savedToken = alice.token;
  alice.setToken('bogus-token-value');
  const wrongToken = await alice.request('/api/notes', {
    method: 'POST',
    body: { title: 'x', content: 'y' },
  });
  check('wrong CSRF token is blocked', wrongToken.status === 403);
  alice.setToken(savedToken);

  console.log('\nNotes CRUD');
  const created = await alice.request('/api/notes', {
    method: 'POST',
    body: { title: 'Grocery list', content: 'milk\neggs' },
  });
  check('create note', created.status === 201 && created.json.note.title === 'Grocery list');
  const noteId = created.json?.note?.id;

  const listed = await alice.request('/api/notes');
  check('list returns the note', listed.json.notes.length === 1);

  const updated = await alice.request(`/api/notes/${noteId}`, {
    method: 'PUT',
    body: { title: 'Grocery list v2', content: 'milk\neggs\nbread' },
  });
  check('update note', updated.status === 200 && updated.json.note.title === 'Grocery list v2');

  const noTitle = await alice.request(`/api/notes/${noteId}`, {
    method: 'PUT',
    body: { title: '   ', content: 'x' },
  });
  check('empty title is rejected', noTitle.status === 400);

  const badId = await alice.request('/api/notes/not-a-number');
  check('non-numeric note id is rejected', badId.status === 400);

  console.log('\nCross-user isolation');
  const bob = newClient();
  await bob.csrfToken();
  const bobSignup = await bob.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'bob@example.com', password: 'bobs very long passphrase' },
  });
  check('second account created', bobSignup.status === 201);
  await bob.csrfToken();

  const bobList = await bob.request('/api/notes');
  check("bob's list is empty", bobList.json.notes.length === 0);

  const bobRead = await bob.request(`/api/notes/${noteId}`);
  check("bob cannot read alice's note", bobRead.status === 404);

  const bobUpdate = await bob.request(`/api/notes/${noteId}`, {
    method: 'PUT',
    body: { title: 'pwned', content: 'pwned' },
  });
  check("bob cannot update alice's note", bobUpdate.status === 404);

  const bobDelete = await bob.request(`/api/notes/${noteId}`, { method: 'DELETE' });
  check("bob cannot delete alice's note", bobDelete.status === 404);

  const stillThere = await alice.request(`/api/notes/${noteId}`);
  check("alice's note is untouched", stillThere.status === 200 && stillThere.json.note.title === 'Grocery list v2');

  console.log('\nLogin, session fixation and logout');
  const alice2 = newClient();
  await alice2.csrfToken();
  const preLoginSid = alice2.jar.get('sid');
  const badLogin = await alice2.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'alice@example.com', password: 'wrong password entirely' },
  });
  check('wrong password is rejected', badLogin.status === 401);
  check('login error is generic', badLogin.json.error === 'Invalid email or password.');

  const unknownUser = await alice2.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@example.com', password: 'wrong password entirely' },
  });
  check('unknown user gets the same error', unknownUser.json.error === 'Invalid email or password.');

  const goodLogin = await alice2.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'Alice@Example.com', password: 'correct horse battery staple' },
  });
  check('login succeeds (case-insensitive email)', goodLogin.status === 200);
  check('session id is regenerated on login', alice2.jar.get('sid') !== preLoginSid);
  check('signup also issued a distinct session', sidAfterSignup !== alice2.jar.get('sid'));

  const cookieHeader = (goodLogin.headers.getSetCookie?.() ?? []).join(' ');
  check('session cookie is HttpOnly', /HttpOnly/i.test(cookieHeader), cookieHeader);
  check('session cookie is SameSite=Strict', /SameSite=Strict/i.test(cookieHeader), cookieHeader);

  await alice2.csrfToken();
  const logout = await alice2.request('/api/auth/logout', { method: 'POST' });
  check('logout succeeds', logout.status === 204);
  await alice2.csrfToken();
  const afterLogout = await alice2.request('/api/notes');
  check('session is dead after logout', afterLogout.status === 401);

  console.log('\nAbuse resistance');
  const big = 'x'.repeat(25000);
  const tooBig = await alice.request('/api/notes', {
    method: 'POST',
    body: { title: 'big', content: big },
  });
  check('oversized note content is rejected', tooBig.status === 400 || tooBig.status === 413);

  const injection = await alice.request('/api/notes', {
    method: 'POST',
    body: { title: "'); DROP TABLE notes;--", content: '<img src=x onerror=alert(1)>' },
  });
  check('SQL-ish input is stored as plain data', injection.status === 201);
  const afterInjection = await alice.request('/api/notes');
  check('notes table still intact', afterInjection.status === 200 && afterInjection.json.notes.length >= 2);
} catch (err) {
  failed += 1;
  console.error('\nUnexpected error:', err);
} finally {
  server.close();
  app.locals.sessionStore?.stop();
  closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
