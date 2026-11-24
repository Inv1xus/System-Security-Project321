import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { id, source, start } from './adapters/google-notes-default.mjs';

const success = 'Successful security control';
const confirmed = 'Confirmed security vulnerability';
const suspected = 'Suspected vulnerability';
const functional = 'Functional failure';
const untested = 'Untested';
const attempts = [];

function check(id, expected, evidence, run) {
  attempts.push({ id, expected, evidence, run });
}

function report(ok, actual, assessment = ok ? success : suspected) {
  return { status: ok ? 'Pass' : 'Fail', actual, assessment };
}

function skip(actual) {
  return { status: 'Skip', actual, assessment: untested };
}

check('T01.auth', 'Anonymous notes request returns 401.', 'server/routes.ts:137', async ({ request }) => {
  const { status } = await request('/notes');
  return report(status === 401, 'HTTP ' + status);
});

check('T01.credentials', 'Incorrect password returns 401.', 'server/routes.ts:79', async ({ request, users }) => {
  const { status } = await request('/auth/login', {
    method: 'POST', body: { username: users[0].username, password: randomBytes(24).toString('hex') },
  });
  return report(status === 401, 'HTTP ' + status);
});

check('T01.crud', 'Owner can create, read, update and delete a note.', 'server/routes.ts:171', async ({ request, users }) => {
  const { cookie } = users[0];
  const created = await request('/notes', { method: 'POST', cookie, body: { title: 'CRUD fixture' } });
  const noteId = created.body?.note?.id;
  if (!Number.isInteger(noteId) || created.status !== 201) return report(false, 'Create HTTP ' + created.status, functional);
  const url = '/notes/' + noteId;
  const before = await request(url, { cookie });
  const update = await request(url, { method: 'PUT', cookie, body: { title: 'Updated fixture' } });
  const after = await request(url, { cookie });
  const deleted = await request(url, { method: 'DELETE', cookie });
  const missing = await request(url, { cookie });
  const statuses = [before, update, after, deleted, missing].map(item => item.status);
  const valid = statuses.join(',') === '200,200,200,200,404'
    && before.body?.note?.title === 'CRUD fixture' && after.body?.note?.title === 'Updated fixture';
  return report(valid, 'Create HTTP 201. Read, update, reread, delete, final read HTTP ' + statuses.join(', '),
    valid ? 'Functional baseline passed' : functional);
});

for (const [operation, method, line] of [['read', 'GET', 171], ['update', 'PUT', 228], ['delete', 'DELETE', 287]]) {
  check('T01.' + operation, 'Non-owner request is denied and the owner note remains intact.',
    'server/routes.ts:' + line, async ({ request, users, createNote }) => {
      const note = await createNote('Ownership fixture');
      const path = '/notes/' + note.id;
      const denied = await request(path, {
        method, cookie: users[1].cookie, body: method === 'PUT' ? { title: 'Second user fixture' } : undefined,
      });
      const owner = await request(path, { cookie: users[0].cookie });
      const intact = owner.status === 200 && owner.body?.note?.title === note.title;
      const disclosed = method === 'GET' && denied.status === 200 && denied.body?.note?.id === note.id;
      const changed = method === 'PUT' && owner.body?.note?.title === 'Second user fixture';
      const removed = method === 'DELETE' && owner.status === 404 && denied.status === 200;
      const valid = [403, 404].includes(denied.status) && intact;
      return report(valid, 'Non-owner HTTP ' + denied.status + '. Owner note intact ' + intact,
        valid ? success : disclosed || changed || removed ? confirmed : suspected);
    });
}

check('T02.literal', 'Ordinary punctuation remains literal in note storage and search.',
  'server/routes.ts:137,198', async ({ request, users, createNote }) => {
    const title = "Fixture owner's notebook";
    const note = await createNote(title);
    const found = await request('/notes?search=' + encodeURIComponent(title), { cookie: users[0].cookie });
    const matches = Array.isArray(found.body?.notes)
      && found.body.notes.length === 1 && found.body.notes[0].id === note.id;
    const valid = note.title === title && found.status === 200 && matches;
    return report(valid, 'Search HTTP ' + found.status + '. Exact fixture selected ' + matches,
      valid ? 'Literal handling verified' : functional);
  });

check('T02.binding', 'The login lookup uses a SQL placeholder for the supplied account identifier.',
  'server/routes.ts:89', async () => {
    const code = await readFile(source + 'server/routes.ts', 'utf8');
    return /FROM users WHERE username = \?['"]\s*\)\s*\.get\(trimmedUsername\)/.test(code)
      ? report(true, 'Reviewed source contains a bound account lookup.')
      : skip('The source pattern did not match. Review the login lookup manually.');
  });

check('T02.injection', 'SQL statements keep user values separate from SQL syntax.',
  'server/routes.ts:89,137,198,244', () => skip('Source review found bound inputs in login, search, create and update. Runtime injection coverage was outside scope.'));

check('T03.storage', 'Inert markup is preserved as note text over JSON.',
  'server/routes.ts:198', async ({ createNote }) => {
    const marker = '<b>Fixture marker</b>';
    const note = await createNote('Markup fixture', marker);
    const exact = note.content === marker;
    return report(exact, 'JSON content matched input ' + exact, exact ? 'API baseline passed' : functional);
  });

check('T03.render', 'The Markdown component escapes inert HTML markup during React rendering.',
  'src/components/MarkdownView.tsx:97', ({ renderInertMarkup }) => {
    const escaped = renderInertMarkup();
    return report(escaped, 'Inert markup escaped in React static output ' + escaped);
  });

check('T03.browser', 'Browser rendering treats note markup as text.',
  'src/components/MarkdownView.tsx:97', () => skip('Browser DOM behavior and script execution were not tested.'));

check('T04.secret', 'Authentication has no literal fallback signing secret.',
  'server/auth.ts:5', async () => {
    const auth = await readFile(source + 'server/auth.ts', 'utf8');
    const literalFallback = /process\.env\.JWT_SECRET\s*\|\|\s*['"`]/.test(auth);
    return literalFallback
      ? report(false, 'Source defines a literal JWT signing fallback.', confirmed)
      : skip('Source no longer matches the reviewed assignment. Review required.');
  });

check('T04.cookie', 'Production login cookie declares HttpOnly, Secure and SameSite=Lax.',
  'server/routes.ts:107', async ({ users }) => {
    const cookie = users[0].setCookie;
    const flags = ['HttpOnly', 'Secure', 'SameSite=Lax'].map(flag =>
      cookie.split(';').slice(1).some(attribute => attribute.trim().toLowerCase() === flag.toLowerCase()));
    return report(flags.every(Boolean), 'HttpOnly ' + flags[0] + ', Secure ' + flags[1] + ', SameSite=Lax ' + flags[2]);
  });

check('T04.logout', 'Logout clears the browser cookie.',
  'server/routes.ts:122', async ({ request, users }) => {
    const result = await request('/auth/logout', { method: 'POST', cookie: users[0].cookie });
    const cleared = /^(?:[^=;]+)=;/.test(result.cookie) && /Expires=/i.test(result.cookie);
    return report(result.status === 200 && cleared, 'HTTP ' + result.status + '. Clearing header present ' + cleared);
  });

check('T04.revocation', 'Logout invalidates the server-side credential.',
  'server/routes.ts:122; server/auth.ts:42', () => skip('Source logout clears the cookie and does not revoke issued JWTs. Credential replay was not exercised.'));

check('T05.hash', 'Two accounts with the same fixture password have distinct bcrypt salts and no plaintext password field.',
  'server/routes.ts:36; server/db.ts:21', ({ users, password, passwordStorage }) => {
    const info = passwordStorage(users.map(user => user.id), password);
    const valid = info.rows === 2 && info.bcrypt && info.distinctSalts && !info.plaintext;
    return report(valid, 'Rows ' + info.rows + ', bcrypt ' + info.bcrypt + ', distinct salts ' + info.distinctSalts
      + ', plaintext in password hash field ' + info.plaintext, valid ? success : info.plaintext ? confirmed : suspected);
  });

check('T06.profile', 'Current-user response exposes only the account field allowlist.',
  'server/routes.ts:128; server/auth.ts:45', async ({ request, users }) => {
    const current = await request('/auth/me', { cookie: users[0].cookie });
    const allowed = current.status === 200 && Object.keys(current.body ?? {}).join() === 'user'
      && Object.keys(current.body?.user ?? {}).sort().join() === 'email,id,username';
    return report(allowed, 'HTTP ' + current.status + '. Exact field allowlist matched ' + allowed,
      allowed ? success : current.status === 200 ? suspected : functional);
  });

check('T06.token', 'Cookie-auth login does not also return a token in its JSON body.',
  'server/routes.ts:107', ({ users }) => report(!users[0].tokenInBody,
    'Login JSON contains a token field ' + users[0].tokenInBody,
    users[0].tokenInBody ? suspected : success));

async function fixtures(app) {
  const password = randomBytes(24).toString('hex');
  const users = [];
  for (let i = 0; i < 2; i++) {
    const username = 'fixture-' + randomBytes(8).toString('hex');
    const body = { username, password };
    const registered = await app.request('/auth/register', { method: 'POST', body });
    if (registered.status !== 201) throw new Error('Registration fixture HTTP ' + registered.status);
    const login = await app.request('/auth/login', { method: 'POST', body });
    if (login.status !== 200 || !login.cookie || !Number.isInteger(login.body?.user?.id)) {
      throw new Error('Login fixture HTTP ' + login.status);
    }
    users.push({
      username, id: login.body.user.id, cookie: login.cookie.split(';', 1)[0],
      setCookie: login.cookie, tokenInBody: typeof login.body.token === 'string',
    });
  }
  return {
    ...app, users, password,
    async createNote(title, content) {
      const created = await app.request('/notes', {
        method: 'POST', cookie: users[0].cookie, body: { title, content },
      });
      if (created.status !== 201 || !Number.isInteger(created.body?.note?.id)) throw new Error('Create fixture failed');
      return created.body.note;
    },
  };
}

const sourceOnly = new Set(['T02.binding', 'T02.injection', 'T03.browser', 'T04.secret', 'T04.revocation']);

test(id, async t => {
  const rows = [];
  const app = await start(t).catch(() => ({ blocked: 'Staging failed.' }));
  const context = app.blocked ? null : await fixtures(app).catch(() => null);
  const blocker = app.blocked || (!context && 'Temporary account setup failed.');
  const directory = new URL('../results/', import.meta.url);
  t.after(async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('google-ai-studio-notes-default.json', directory), JSON.stringify({
      application: id, node: process.version, platform: process.platform, architecture: process.arch,
      bun: app.bun ?? null, lockMode: app.lockMode ?? null, dependencies: app.versions ?? null, blocker: blocker || null, tests: rows,
    }, null, 2) + '\n');
  });
  for (const { id, expected, evidence, run } of attempts) {
    const result = blocker && !sourceOnly.has(id)
      ? skip(blocker)
      : await Promise.resolve().then(() => run(context)).catch(() =>
        report(false, 'An HTTP, fixture or inspection step failed.', functional));
    rows.push({
      id, expected, ...result, evidence,
      mode: ['T02.binding', 'T04.secret'].includes(id) ? 'source' : result.status === 'Skip' ? 'untested' : 'runtime',
    });
    await t.test(id, { skip: result.status === 'Skip' ? result.actual : false }, () => {
      assert.ok(result.status === 'Pass', result.actual);
    });
  }
  if (blocker) await t.test('Runtime prerequisites', () => assert.fail(blocker));
});
