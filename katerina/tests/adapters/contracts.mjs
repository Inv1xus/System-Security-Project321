import { randomBytes } from 'node:crypto';
import { secret } from '../stage.mjs';

const success = response => response.status >= 200 && response.status < 300;
const list = response => response.json?.bookings ?? response.json;
const csrf = response => response.text.match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
const session = response => ({
  cookie: response.setCookie.split(';', 1)[0],
  csrf: response.json?.csrfToken ?? csrf(response),
  setCookie: response.setCookie,
});
const requireFixture = (condition, label, status) => {
  if (!condition) throw Error(label + ' fixture failed (HTTP ' + status + ').');
};

export function contracts(app, runtime) {
  const forms = app.notes === 'forms';
  const prefix = app.prefix ?? '/api/auth';
  const notePath = forms ? '/notes' : '/api/notes';
  const bookingPath = '/api/bookings';
  const mine = app.booking === 'google-secure' ? bookingPath + '/mine' : bookingPath;
  const protectedPath = app.notes ? notePath : mine;
  const { request } = runtime;

  async function auth(action, body, headers) {
    const path = prefix + '/' + action;
    if (!forms) return request(path, { method: 'POST', body, headers });
    const page = await request(path);
    const guest = session(page);
    requireFixture(page.status === 200 && guest.csrf && guest.cookie, 'Guest form', page.status);
    return request(path, { method: 'POST', body: { ...body, _csrf: guest.csrf }, session: guest, form: true });
  }

  async function account(password) {
    const username = 'fixture' + randomBytes(5).toString('hex');
    const email = username + '@example.test';
    const credentials = { username, email, name: 'Fixture user', password };
    const signup = await auth(app.signup, credentials);
    requireFixture(success(signup) || forms && signup.status === 302, 'Registration', signup.status);
    const response = await auth('login', credentials);
    const signed = session(response);
    requireFixture((success(response) || forms && response.status === 302) && signed.cookie, 'Login', response.status);
    if (forms) {
      const notes = await request(notePath, { session: signed });
      signed.csrf = csrf(notes);
      requireFixture(notes.status === 200 && signed.csrf, 'Authenticated form', notes.status);
    }
    return {
      ...signed, credentials,
      tokenInBody: typeof response.json?.token === 'string',
    };
  }

  async function note(id, actor, operation, { title = 'Edited fixture', content = 'Updated body', omitCsrf = false } = {}) {
    const path = id ? notePath + '/' + encodeURIComponent(id) : notePath;
    const active = omitCsrf ? { cookie: actor?.cookie } : actor;
    const write = operation === 'create' || operation === 'update';
    if (forms) {
      const suffix = operation === 'update' ? '/edit' : operation === 'delete' ? '/delete' : '';
      if (operation !== 'read' && !omitCsrf) {
        const page = await request(notePath, { session: actor });
        active.csrf = csrf(page);
        requireFixture(page.status === 200 && active.csrf, 'Authenticated form', page.status);
      }
      const body = operation === 'read' ? undefined : {
        ...(write ? { title, body: content } : {}), ...(active?.csrf ? { _csrf: active.csrf } : {}),
      };
      return request(path + suffix, { session: active, form: true, method: operation === 'read' ? 'GET' : 'POST', body });
    }
    const method = { create: 'POST', read: 'GET', update: 'PUT', delete: 'DELETE' }[operation];
    return request(path, { method, session: active, body: write ? {
      title, [app.notes === 'secure-json' ? 'content' : 'body']: content,
    } : undefined });
  }

  async function createNote(actor, title, content) {
    const response = await note(null, actor, 'create', { title, content });
    const id = forms ? response.location?.match(/^\/notes\/(\d+)$/)?.[1] : (response.json?.note ?? response.json)?.id;
    requireFixture(id && response.status === (forms ? 302 : 201), 'Note creation', response.status);
    return id;
  }

  function noteMatches(response, title, content) {
    if (response.status !== 200) return false;
    if (forms) {
      const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
      return response.text.includes(escape(title)) && response.text.includes(escape(content));
    }
    const row = response.json?.note ?? response.json;
    return row?.title === title && (row?.content ?? row?.body) === content;
  }

  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const startTime = date + 'T10:00:00Z';
  const endTime = date + 'T10:30:00Z';
  const adminPath = {
    'google-plain': '/api/slots', 'google-secure': '/api/admin/slots',
    'kiro-plain': '/api/admin/slots', 'kiro-secure': '/api/slots',
  }[app.booking];
  const slotBody = {
    'google-plain': { title: "Owner's fixture", slot_date: date, start_time: '10:00', end_time: '10:30' },
    'google-secure': { title: "Owner's fixture", startTime, endTime },
    'kiro-plain': { date, start_time: '10:00', end_time: '10:30', capacity: 1 },
    'kiro-secure': { start_time: date + 'T10:00', duration: 30 },
  }[app.booking];

  async function admin() {
    let credentials;
    if (['google-plain', 'kiro-plain'].includes(app.booking)) {
      const temporary = await account(secret());
      credentials = temporary.credentials;
      const updated = runtime.database(db => db.prepare('UPDATE users SET role = ? WHERE ' + app.account + ' = ?')
        .run('admin', credentials[app.account]), false);
      if (updated.changes !== 1) throw Error('Admin fixture promotion failed.');
    } else {
      credentials = { email: 'fixture-admin@example.test', username: 'admin', password: runtime.adminPassword };
    }
    const response = await auth('login', credentials);
    const actor = session(response);
    requireFixture(success(response) && actor.cookie, 'Admin login', response.status);
    return actor;
  }

  function slot(actor) {
    return request(adminPath, { method: 'POST', session: actor, body: slotBody });
  }

  async function bookingFixture(actor) {
    const created = await slot(await admin());
    const slotId = created.json?.slot?.id ?? created.json?.slotId ?? created.json?.id;
    requireFixture(success(created) && slotId, 'Slot creation', created.status);
    const body = app.booking === 'google-secure' ? { slotId, notes: "Owner's fixture" } : { slot_id: slotId };
    const booked = await request(bookingPath, { method: 'POST', session: actor, body });
    const id = booked.json?.booking?.id ?? booked.json?.bookingId ?? booked.json?.booking_id;
    requireFixture(success(booked) && id, 'Booking creation', booked.status);
    return { id, slotId, body, created };
  }

  function cancel(id, actor) {
    const googlePlain = app.booking === 'google-plain';
    const googleSecure = app.booking === 'google-secure';
    return request(bookingPath + '/' + id + (googlePlain || googleSecure ? '/cancel' : ''), {
      method: googlePlain ? 'PATCH' : googleSecure ? 'POST' : 'DELETE', session: actor,
    });
  }

  function hasBooking(response, id) {
    if (response.status !== 200 || !Array.isArray(list(response))) throw Error('Booking list fixture failed.');
    return list(response).some(row => (row.id ?? row.booking_id) === id
      && !row.cancelled_at && !row.cancelledAt && row.status !== 'cancelled');
  }

  return {
    forms, notePath, protectedPath, account, auth, note, createNote, noteMatches,
    slot, bookingFixture, hasBooking, cancel,
    bookings: actor => request(mine, { session: actor }),
    repeatBooking: (actor, body) => request(bookingPath, { method: 'POST', session: actor, body }),
    profile: actor => request(forms ? notePath : prefix + '/me', { session: actor }),
    async logout(actor) {
      let body;
      if (forms) {
        const page = await request(notePath, { session: actor });
        const token = csrf(page);
        requireFixture(page.status === 200 && token, 'Logout form', page.status);
        body = { _csrf: token };
      }
      return request(prefix + '/logout', { method: 'POST', session: actor, form: forms, body });
    },
  };
}
