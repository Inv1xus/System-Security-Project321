import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { applications } from './adapters/matrix.mjs';
import { contracts } from './adapters/contracts.mjs';
import { secret, stage } from './stage.mjs';

const results = new URL('../results/', import.meta.url);
const control = 'Successful security control';
const confirmed = 'Confirmed security vulnerability';
const suspect = 'Suspected vulnerability';
const functional = 'Functional failure';
const skip = actual => ({ status: 'Skip', actual, assessment: 'Untested' });
const outcome = (valid, actual, good = control, bad = suspect) =>
  ({ status: valid ? 'Pass' : 'Fail', actual, assessment: valid ? good : bad });
const baseline = (valid, actual) => outcome(valid, actual, 'Functional baseline passed', functional);
const ok = response => response.status >= 200 && response.status < 300;
const denied = response => [403, 404].includes(response.status);
const marker = '<b>Fixture marker</b>';
const title = "Owner's fixture";
const baselineTitle = 'Owner fixture';

for (const app of applications) {
  test(app.id, async t => {
    const rows = [];
    const runtime = await stage(t, app).catch(() => ({ blocked: 'Staging failed.' }));
    const adapter = runtime.blocked ? null : contracts(app, runtime);
    const password = secret();
    let first;
    let second;
    let fixtureError;
    if (adapter) {
      try {
        first = await adapter.account(password);
        second = await adapter.account(password);
      } catch (error) {
        fixtureError = /^[A-Za-z ]+ fixture failed \(HTTP \d{3}\)\.$/.test(error.message)
          ? error.message : 'Temporary account setup failed.';
      }
    }
    const { request, database } = runtime;
    const [auth, resource, storage] = app.evidence;
    const blocker = runtime.blocked || fixtureError;
    const { dependencies, node, installer, lockMode } = runtime;
    t.after(async () => {
      await mkdir(results, { recursive: true });
      await writeFile(new URL(app.id.replace('/', '-') + '.json', results), JSON.stringify({
        application: app.id, harnessNode: process.version, node, installer, lockMode, dependencies,
        platform: process.platform, architecture: process.arch, blocker: blocker || null, tests: rows,
      }, null, 2) + '\n');
    });

    async function record(id, expected, evidence, run, mode = 'runtime', needsAccounts = true) {
      const prevented = mode === 'runtime' && (runtime.blocked || needsAccounts && fixtureError);
      const result = prevented ? skip(prevented) : await Promise.resolve().then(run).catch(error => {
        const safe = /^[A-Za-z ]+ fixture failed \(HTTP \d{3}\)\.$/.test(error.message);
        return outcome(false, safe ? error.message : 'A fixture, HTTP or inspection step failed.', control, functional);
      });
      rows.push({ id, expected, ...result, evidence, mode: result.status === 'Skip' && mode === 'runtime' ? 'untested' : mode });
      await t.test(id, { skip: result.status === 'Skip' ? result.actual : false }, () => {
        assert.ok(result.status === 'Pass', result.actual);
      });
    }

    await record('T01.auth', 'Anonymous clients are denied access to the protected resource.', resource, async () => {
      const response = await request(adapter.protectedPath);
      const blocked = adapter.forms ? response.status === 302 && response.location === '/login' : response.status === 401;
      return outcome(blocked, 'HTTP ' + response.status);
    }, 'runtime', false);

    await record('T01.credentials', 'An incorrect password is denied.', auth, async () => {
      const response = await adapter.auth('login', { ...first.credentials, password: secret() });
      const valid = adapter.forms ? [400, 401].includes(response.status) : response.status === 401;
      return outcome(valid, 'HTTP ' + response.status);
    });

    let fixture;
    if (app.notes) {
      await record('T01.crud', 'Owner can create, read, update and delete a note.', resource, async () => {
        const id = await adapter.createNote(first, baselineTitle, 'Original body');
        const before = await adapter.note(id, first, 'read');
        const update = await adapter.note(id, first, 'update');
        const after = await adapter.note(id, first, 'read');
        const deleted = await adapter.note(id, first, 'delete');
        const missing = await adapter.note(id, first, 'read');
        const valid = adapter.noteMatches(before, baselineTitle, 'Original body') && adapter.noteMatches(after, 'Edited fixture', 'Updated body')
          && [update, deleted].every(response => adapter.forms ? response.status === 302 : ok(response)) && missing.status === 404;
        return baseline(valid, 'Read, update, reread, delete, final read HTTP ' + [before, update, after, deleted, missing].map(item => item.status).join(', '));
      });
      for (const operation of ['read', 'update', 'delete']) {
        await record('T01.' + operation, 'Non-owner action is denied and owner state remains intact.', resource, async () => {
          const id = await adapter.createNote(first, baselineTitle, 'Owner body');
          const attempt = await adapter.note(id, second, operation);
          const owner = await adapter.note(id, first, 'read');
          const intact = adapter.noteMatches(owner, baselineTitle, 'Owner body');
          const impact = operation === 'read' ? adapter.noteMatches(attempt, baselineTitle, 'Owner body')
            : operation === 'update' ? adapter.noteMatches(owner, 'Edited fixture', 'Updated body')
              : owner.status === 404 && (ok(attempt) || attempt.status === 302);
          return outcome(denied(attempt) && intact, 'Non-owner HTTP ' + attempt.status + '. Owner state intact ' + intact,
            control, impact ? confirmed : suspect);
        });
      }
    } else {
      await record('T01.admin', 'Ordinary user cannot create a slot through the admin operation.', resource, async () => {
        const response = await adapter.slot(first);
        const created = response.json?.slot?.id ?? response.json?.slotId ?? response.json?.id;
        return outcome(response.status === 403, 'Non-admin HTTP ' + response.status + '. Created slot identifier present ' + Boolean(created),
          control, ok(response) && created ? confirmed : suspect);
      });
      await record('T01.crud', 'Admin creates a slot and owner creates and lists a booking.', resource, async () => {
        fixture = await adapter.bookingFixture(first);
        const present = adapter.hasBooking(await adapter.bookings(first), fixture.id);
        return baseline(present, 'Owner listing contains the booking ' + present);
      });
      await record('T01.read', 'Second user cannot see the owner booking.', resource, async () => {
        if (!fixture) return skip('Booking fixture unavailable.');
        const visible = adapter.hasBooking(await adapter.bookings(second), fixture.id);
        return outcome(!visible, 'Owner booking visible to second user ' + visible, control, confirmed);
      });
      await record('T01.cancel', 'Second user cannot cancel the booking and the owner can.', resource, async () => {
        if (!fixture) return skip('Booking fixture unavailable.');
        const attempt = await adapter.cancel(fixture.id, second);
        const state = adapter.hasBooking(await adapter.bookings(first), fixture.id);
        if (!denied(attempt) || !state) {
          return outcome(false, 'Non-owner HTTP ' + attempt.status + '. Owner booking active ' + state,
            control, ok(attempt) && !state ? confirmed : suspect);
        }
        const duplicate = await adapter.repeatBooking(first, fixture.body);
        const own = await adapter.cancel(fixture.id, first);
        const active = adapter.hasBooking(await adapter.bookings(first), fixture.id);
        return duplicate.status === 409 && ok(own) && !active
          ? outcome(true, 'Non-owner HTTP ' + attempt.status + ', duplicate HTTP 409, owner HTTP ' + own.status)
          : baseline(false, 'Ownership denial verified. Duplicate HTTP ' + duplicate.status + ', owner HTTP ' + own.status + '. Booking active ' + active);
      });
    }

    await record('T02.literal', 'Input with ordinary punctuation remains literal across storage and retrieval.', resource, async () => {
      if (app.notes) {
        const id = await adapter.createNote(first, baselineTitle, title);
        const matched = adapter.noteMatches(await adapter.note(id, first, 'read'), baselineTitle, title);
        return baseline(matched, 'Stored fixture matched literal input ' + matched);
      }
      if (!app.booking.startsWith('google')) return skip('Booking contract uses structured date, time and numeric slot input.');
      if (!fixture) return skip('Booking fixture unavailable.');
      const matched = fixture.created.json?.slot?.title === title;
      return baseline(matched, 'Created slot title matched literal input ' + matched);
    });
    await record('T02.binding', 'The login lookup uses a SQL placeholder for the supplied account identifier.', auth, async () => {
      const sourcePath = auth.split(':')[0];
      const code = await readFile(new URL('../' + app.id + '/' + sourcePath, import.meta.url), 'utf8');
      const placeholder = code.includes('FROM users WHERE ' + app.account + ' = ?');
      const call = app.notes === 'plain-json'
        ? /findUser\.get\(username\)/.test(code)
        : new RegExp('\\.get\\(\\s*' + app.account + '(?:\\.trim\\(\\))?\\s*\\)').test(code)
          || app.notes === 'secure-json' && /\.get\(normalizedUsername\)/.test(code);
      return placeholder && call
        ? outcome(true, 'Reviewed source contains a bound account lookup.')
        : skip('The source pattern did not match. Review the login lookup manually.');
    }, 'source');
    await record('T02.injection', 'SQL inputs are evaluated for parameter binding.', resource,
      () => skip('Runtime SQL injection was outside scope. See T02.binding for the source check.'), 'untested');

    await record('T03.storage', 'Inert markup is handled as text on the tested output path.', resource, async () => {
      if (!app.notes) return skip('Browser rendering of booking fields was not exercised.');
      const id = await adapter.createNote(first, 'Markup fixture', marker);
      const response = await adapter.note(id, first, 'read');
      const matched = adapter.noteMatches(response, 'Markup fixture', marker);
      return app.notes === 'forms'
        ? outcome(matched && !response.text.includes(marker), 'Inert markup appeared as escaped text ' + matched)
        : baseline(matched, 'JSON content equals fixture text ' + matched);
    });
    await record('T03.browser', 'Browser DOM behavior is evaluated.', resource,
      () => skip('Browser DOM behavior and script execution were not exercised.'), 'untested');
    if (app.suspicion) {
      await record('T03.sink', 'Stored account fields are escaped before insertion into HTML.', app.suspicion[1],
        () => outcome(false, app.suspicion[0], control, suspect), 'source');
    }

    for (const [id, actual, evidence] of app.sourceFindings ?? []) {
      await record(id, 'Authentication has no embedded default secret or password.', evidence,
        () => outcome(false, actual, control, confirmed), 'source');
    }
    await record('T04.cookie', 'Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable.',
      app.proxyCookie ?? auth, async () => {
        const proxied = app.proxyCookie ? await adapter.auth('login', first.credentials, { 'X-Forwarded-Proto': 'https' }) : null;
        if (proxied && !ok(proxied)) return baseline(false, 'Proxy-indicated login HTTP ' + proxied.status);
        const cookie = proxied ? proxied.setCookie : first.setCookie;
        const attributes = cookie.split(';').slice(1).map(value => value.trim().toLowerCase());
        const findings = [attributes.includes('httponly'), attributes.some(value => value.startsWith('samesite=')), attributes.includes('secure')];
        const summary = 'HttpOnly ' + findings[0] + ', SameSite ' + findings[1] + ', Secure ' + findings[2];
        return outcome(findings[0] && findings[1] && (adapter.forms || findings[2]),
          summary + (adapter.forms ? '. Secure disabled by the required local HTTP setting.' : proxied ? ' with proxy HTTPS header.' : '.'));
      });
    if (adapter?.forms || app.notes === 'forms') {
      await record('T04.cookie-secure', 'The EJS app declares Secure in its HTTPS deployment.',
        'src/app.js:89', () => skip('Secure transport was outside the staged form session configuration.'), 'untested');
    }
    await record('T04.csrf', 'Documented anti-CSRF controls reject an invalid authenticated write.', resource, async () => {
      let response;
      if (['forms', 'secure-json'].includes(app.notes)) {
        response = await adapter.note(null, first, 'create', { omitCsrf: true });
      } else if (app.booking === 'google-secure') {
        // Invalid origin is preempted by middleware before the empty body is evaluated.
        response = await request('/api/bookings', { method: 'POST', session: first,
          headers: { Origin: 'http://fixture.invalid' }, body: {} });
      } else {
        return skip('No adapter-specific CSRF control was exercised.');
      }
      return outcome(response.status === 403, 'HTTP ' + response.status);
    });
    const sqliteSessions = Boolean(app.notes) || app.booking === 'google-secure';
    let sessionDelta;
    await record('T04.logout', 'Logout succeeds and returns a cookie-clearing header.', app.logoutEvidence ?? auth, async () => {
      const before = sqliteSessions ? runtime.sessionCount() : null;
      const response = await adapter.logout(first);
      if (before !== null) sessionDelta = before - runtime.sessionCount();
      const cleared = /^[^=;]+=;/.test(response.setCookie) && /Expires=/i.test(response.setCookie);
      const loggedOut = ok(response) || adapter.forms && response.status === 302;
      return outcome(loggedOut && cleared, 'HTTP ' + response.status + '. Clearing header present ' + cleared,
        control, functional);
    });
    await record('T04.revocation', 'Logout removes one session record from the isolated store.', app.logoutEvidence ?? auth, () => {
      if (!sqliteSessions) return skip('No SQLite session row to inspect. Credential replay, fixation and expiry were outside scope.');
      if (sessionDelta === undefined) return skip('Logout session-store measurement unavailable.');
      return outcome(sessionDelta === 1, 'Session row count decreased by ' + sessionDelta);
    });

    await record('T05.hash', 'Temporary passwords are salted bcrypt or scrypt values with distinct salts.', storage, () => {
      const field = app.account;
      const hashes = database(db => db.prepare('SELECT ' + app.hash + ' AS hash FROM users WHERE ' + field + ' IN (?, ?)')
        .all(first.credentials[field], second.credentials[field]).map(row => row.hash));
      const salts = hashes.map(hash => /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(hash)
        ? hash.slice(7, 29) : /^scrypt\$\d+\$\d+\$\d+\$[a-f0-9]+\$[a-f0-9]+$/.test(hash) ? hash.split('$')[4] : null);
      const formatted = hashes.length === 2 && salts.every(Boolean);
      const distinct = new Set(salts).size === 2;
      const plain = hashes.includes(password);
      return outcome(formatted && distinct && !plain,
        'Rows ' + hashes.length + ', expected format ' + formatted + ', distinct salts ' + distinct + ', plaintext ' + plain,
        control, plain ? confirmed : suspect);
    });

    await record('T06.profile', app.notes === 'forms' ? 'Authenticated notes HTML does not contain the fixture password.'
      : 'The second account profile exposes no password or session fields.', auth, async () => {
      const response = await adapter.profile(second);
      if (response.status !== 200) return baseline(false, 'Profile HTTP ' + response.status);
      if (adapter.forms) {
        const exposed = response.text.includes(password);
        return outcome(!exposed, 'Fixture password present in authenticated HTML ' + exposed, control, confirmed);
      }
      const sensitive = new Set(['password', 'password_hash', 'passwordHash', 'token', 'sessionToken', 'sessionId', 'secret']);
      function contains(value) {
        return value && typeof value === 'object'
          && Object.entries(value).some(([key, item]) => sensitive.has(key) || contains(item));
      }
      const exposed = Boolean(contains(response.json));
      const profile = response.json?.user ?? response.json;
      if (!profile || profile[app.account] !== second.credentials[app.account]) {
        return baseline(false, 'Response did not identify the authenticated fixture account.');
      }
      return outcome(!exposed, 'Sensitive field present ' + exposed);
    });
    await record('T06.token', 'Login does not return a session token in the JSON body.', auth,
      () => adapter.forms ? skip('The application signs in with an HTML form and redirect.')
        : outcome(!first.tokenInBody, 'Login JSON token field present ' + first.tokenInBody));

    if (blocker) await t.test('Runtime prerequisites', () => assert.fail(blocker));
  });
}
