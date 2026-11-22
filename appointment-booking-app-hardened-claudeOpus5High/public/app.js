'use strict';

/*
 * Front end for the appointment booking app.
 *
 * Every value that comes from the server is inserted with textContent or as a
 * DOM property - never with innerHTML - so a hostile email address or any other
 * stored string cannot become markup. The page itself ships no inline script or
 * style, which lets the server enforce a strict Content-Security-Policy.
 */

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  csrfToken: null,
};

/* ----------------------------------------------------------- transport ---- */

async function api(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.csrfToken && method !== 'GET') headers['X-CSRF-Token'] = state.csrfToken;

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    redirect: 'error',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  if (res.status !== 204) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = new Error((payload && payload.error) || `Request failed (${res.status}).`);
    err.status = res.status;
    err.code = payload && payload.code;
    throw err;
  }
  return payload;
}

/* ------------------------------------------------------------- helpers ---- */

function flash(message, kind = 'info') {
  const el = $('flash');
  el.textContent = message;
  el.className = `flash ${kind}`;
  el.hidden = !message;
}

function clearFlash() {
  flash('');
}

const fmtDateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function when(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fmtDateTime.format(d);
}

function minutesBetween(startIso, endIso) {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  return Number.isFinite(ms) ? `${Math.round(ms / 60000)} min` : '—';
}

function cell(row, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  row.appendChild(td);
  return td;
}

function actionCell(row, label, className, onClick) {
  const td = document.createElement('td');
  td.className = 'actions';
  if (label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await onClick();
      } finally {
        btn.disabled = false;
      }
    });
    td.appendChild(btn);
  }
  row.appendChild(td);
  return td;
}

function replaceRows(tbody, rows) {
  tbody.replaceChildren(...rows);
}

/* ---------------------------------------------------------------- views ---- */

function showAuth() {
  $('auth-view').hidden = false;
  $('app-view').hidden = true;
  $('session-box').hidden = true;
}

function showApp() {
  $('auth-view').hidden = true;
  $('app-view').hidden = false;
  $('session-box').hidden = false;
  $('session-email').textContent = state.user.email;
  const isAdmin = state.user.role === 'admin';
  $('session-role').hidden = !isAdmin;
  $('tab-admin').hidden = !isAdmin;
}

function selectTab(name) {
  const tabs = { slots: 'tab-slots', mine: 'tab-mine', admin: 'tab-admin' };
  const panels = { slots: 'panel-slots', mine: 'panel-mine', admin: 'panel-admin' };
  for (const key of Object.keys(tabs)) {
    $(tabs[key]).classList.toggle('active', key === name);
    $(panels[key]).hidden = key !== name;
  }
}

/* --------------------------------------------------------------- loaders --- */

async function loadSlots() {
  const { slots } = await api('GET', '/api/slots');
  const rows = slots.map((slot) => {
    const tr = document.createElement('tr');
    cell(tr, when(slot.startsAt));
    cell(tr, minutesBetween(slot.startsAt, slot.endsAt));
    cell(tr, `${slot.remaining} of ${slot.capacity}`, slot.remaining === 0 ? 'full' : undefined);
    if (slot.bookedByMe) {
      cell(tr, 'Booked by you', 'actions status-booked');
    } else if (slot.remaining === 0) {
      cell(tr, 'Full', 'actions full');
    } else {
      actionCell(tr, 'Book', 'primary', () => bookSlot(slot.id));
    }
    return tr;
  });
  replaceRows($('slots-body'), rows);
  $('slots-empty').hidden = rows.length > 0;
}

async function loadMyBookings() {
  const { bookings } = await api('GET', '/api/bookings?includeCancelled=true');
  const rows = bookings.map((b) => {
    const tr = document.createElement('tr');
    cell(tr, when(b.startsAt));
    cell(tr, minutesBetween(b.startsAt, b.endsAt));
    cell(tr, b.status === 'booked' ? 'Booked' : 'Cancelled', `status-${b.status}`);
    const cancellable = b.status === 'booked' && Date.parse(b.startsAt) > Date.now();
    if (cancellable) {
      actionCell(tr, 'Cancel', 'ghost danger', () => cancelBooking(b.id));
    } else {
      actionCell(tr, null);
    }
    return tr;
  });
  replaceRows($('mine-body'), rows);
  $('mine-empty').hidden = rows.length > 0;
}

async function loadAdminSlots() {
  const { slots } = await api('GET', '/api/admin/slots');
  const rows = slots.map((slot) => {
    const tr = document.createElement('tr');
    cell(tr, when(slot.startsAt));
    cell(tr, minutesBetween(slot.startsAt, slot.endsAt));
    cell(tr, String(slot.booked));
    cell(tr, String(slot.capacity));
    actionCell(tr, 'Remove', 'ghost danger', () => removeSlot(slot));
    return tr;
  });
  replaceRows($('admin-slots-body'), rows);
  $('admin-slots-empty').hidden = rows.length > 0;
}

async function loadAdminBookings() {
  const includeCancelled = $('show-cancelled').checked;
  const { bookings } = await api(
    'GET',
    `/api/admin/bookings?includeCancelled=${includeCancelled ? 'true' : 'false'}`,
  );
  const rows = bookings.map((b) => {
    const tr = document.createElement('tr');
    cell(tr, when(b.startsAt));
    cell(tr, b.user.email);
    cell(tr, b.status === 'booked' ? 'Booked' : 'Cancelled', `status-${b.status}`);
    cell(tr, when(b.createdAt));
    return tr;
  });
  replaceRows($('admin-bookings-body'), rows);
  $('admin-bookings-empty').hidden = rows.length > 0;
}

async function refreshAll() {
  await loadSlots();
  await loadMyBookings();
  if (state.user && state.user.role === 'admin') {
    await loadAdminSlots();
    await loadAdminBookings();
  }
}

/* --------------------------------------------------------------- actions --- */

async function guard(fn, successMessage) {
  try {
    clearFlash();
    await fn();
    if (successMessage) flash(successMessage, 'success');
  } catch (err) {
    if (err.status === 401) {
      state.user = null;
      state.csrfToken = null;
      showAuth();
      flash('Your session expired. Please sign in again.', 'error');
      return;
    }
    flash(err.message || 'Something went wrong.', 'error');
  }
}

function bookSlot(slotId) {
  return guard(async () => {
    await api('POST', '/api/bookings', { slotId });
    await Promise.all([loadSlots(), loadMyBookings()]);
    if (state.user.role === 'admin') await loadAdminBookings();
  }, 'Slot booked.');
}

function cancelBooking(id) {
  return guard(async () => {
    await api('DELETE', `/api/bookings/${encodeURIComponent(id)}`);
    await Promise.all([loadSlots(), loadMyBookings()]);
    if (state.user.role === 'admin') await loadAdminBookings();
  }, 'Booking cancelled.');
}

function removeSlot(slot) {
  const force = slot.booked > 0;
  if (force) {
    const ok = window.confirm(
      `This slot has ${slot.booked} active booking(s). Removing it cancels them. Continue?`,
    );
    if (!ok) return Promise.resolve();
  }
  return guard(async () => {
    await api('DELETE', `/api/admin/slots/${encodeURIComponent(slot.id)}?force=${force}`);
    await Promise.all([loadAdminSlots(), loadSlots(), loadMyBookings(), loadAdminBookings()]);
  }, 'Slot removed.');
}

async function loadSession() {
  const data = await api('GET', '/api/auth/me');
  state.user = data.user;
  state.csrfToken = data.csrfToken;
}

/* ------------------------------------------------------------------ wire --- */

function wireAuthTabs() {
  $('tab-login').addEventListener('click', () => {
    $('tab-login').classList.add('active');
    $('tab-signup').classList.remove('active');
    $('login-form').hidden = false;
    $('signup-form').hidden = true;
    clearFlash();
  });
  $('tab-signup').addEventListener('click', () => {
    $('tab-signup').classList.add('active');
    $('tab-login').classList.remove('active');
    $('signup-form').hidden = false;
    $('login-form').hidden = true;
    clearFlash();
  });
}

function wireForms() {
  $('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = $('login-email').value;
    const password = $('login-password').value;
    return guard(async () => {
      const data = await api('POST', '/api/auth/login', { email, password });
      state.user = data.user;
      state.csrfToken = data.csrfToken;
      $('login-password').value = '';
      showApp();
      selectTab('slots');
      await refreshAll();
    });
  });

  $('signup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = $('signup-email').value;
    const password = $('signup-password').value;
    return guard(async () => {
      const data = await api('POST', '/api/auth/signup', { email, password });
      state.user = data.user;
      state.csrfToken = data.csrfToken;
      $('signup-password').value = '';
      showApp();
      selectTab('slots');
      await refreshAll();
    }, 'Welcome! Your account is ready.');
  });

  $('slot-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const local = $('slot-start').value;
    const durationMinutes = Number($('slot-duration').value);
    const capacity = Number($('slot-capacity').value);
    const parsed = new Date(local);
    if (!local || Number.isNaN(parsed.getTime())) {
      flash('Pick a valid start date and time.', 'error');
      return undefined;
    }
    return guard(async () => {
      await api('POST', '/api/admin/slots', {
        startsAt: parsed.toISOString(),
        durationMinutes,
        capacity,
      });
      await Promise.all([loadAdminSlots(), loadSlots()]);
    }, 'Slot added.');
  });
}

function wireButtons() {
  $('logout-btn').addEventListener('click', () =>
    guard(async () => {
      await api('POST', '/api/auth/logout');
      state.user = null;
      state.csrfToken = null;
      showAuth();
    }),
  );

  $('tab-slots').addEventListener('click', () => selectTab('slots'));
  $('tab-mine').addEventListener('click', () => selectTab('mine'));
  $('tab-admin').addEventListener('click', () => selectTab('admin'));

  $('refresh-slots').addEventListener('click', () => guard(loadSlots));
  $('refresh-mine').addEventListener('click', () => guard(loadMyBookings));
  $('refresh-admin-slots').addEventListener('click', () => guard(loadAdminSlots));
  $('show-cancelled').addEventListener('change', () => guard(loadAdminBookings));
}

async function init() {
  wireAuthTabs();
  wireForms();
  wireButtons();

  try {
    await loadSession();
  } catch {
    state.user = null;
  }

  if (state.user) {
    showApp();
    selectTab('slots');
    await guard(refreshAll);
  } else {
    showAuth();
  }
}

init();
