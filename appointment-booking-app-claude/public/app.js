'use strict';

const $ = (id) => document.getElementById(id);

let currentUser = null;

/* ------------------------------- helpers -------------------------------- */

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin'
  });

  let data = {};
  try { data = await response.json(); } catch { /* empty body */ }

  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function flash(message, kind = 'success') {
  const banner = $('banner');
  banner.textContent = message;
  banner.className = `banner ${kind}`;
  banner.hidden = !message;
}

function clearFlash() { $('banner').hidden = true; }

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatLength(startsAt, endsAt) {
  const minutes = Math.round((new Date(endsAt) - new Date(startsAt)) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Builds a row from plain text cells, so nothing user-supplied is ever parsed as HTML. */
function row(cells) {
  const tr = document.createElement('tr');
  for (const cell of cells) {
    const td = document.createElement('td');
    if (cell instanceof Node) {
      td.className = 'actions';
      td.append(cell);
    } else if (cell && typeof cell === 'object') {
      const tag = document.createElement('span');
      tag.className = `tag ${cell.tag}`;
      tag.textContent = cell.text;
      td.append(tag);
    } else {
      td.textContent = cell;
    }
    tr.append(td);
  }
  return tr;
}

function actionButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onClick();
    } catch (err) {
      flash(err.message, 'error');
      button.disabled = false;
    }
  });
  return button;
}

function fillTable(tableId, emptyId, rows) {
  const body = document.querySelector(`#${tableId} tbody`);
  body.replaceChildren(...rows);
  $(tableId).hidden = rows.length === 0;
  $(emptyId).hidden = rows.length > 0;
}

/* -------------------------------- views --------------------------------- */

function render() {
  const signedIn = Boolean(currentUser);
  const isAdmin = signedIn && currentUser.role === 'admin';

  $('authView').hidden = signedIn;
  $('userView').hidden = !signedIn || isAdmin;
  $('adminView').hidden = !isAdmin;
  $('session').hidden = !signedIn;

  if (signedIn) {
    $('who').textContent = isAdmin ? `${currentUser.email} (admin)` : currentUser.email;
  }
}

async function loadUserData() {
  const [{ slots }, { bookings }] = await Promise.all([api('/api/slots'), api('/api/bookings')]);

  fillTable('slotsTable', 'slotsEmpty', slots.map((slot) => row([
    formatWhen(slot.startsAt),
    formatLength(slot.startsAt, slot.endsAt),
    actionButton('Book', '', async () => {
      await api('/api/bookings', { method: 'POST', body: { slotId: slot.id } });
      flash('Slot booked.');
      await loadUserData();
    })
  ])));

  fillTable('myBookingsTable', 'myBookingsEmpty', bookings.map((booking) => row([
    formatWhen(booking.startsAt),
    formatLength(booking.startsAt, booking.endsAt),
    formatDate(booking.bookedAt),
    actionButton('Cancel', 'danger', async () => {
      await api(`/api/bookings/${booking.id}`, { method: 'DELETE' });
      flash('Booking cancelled.');
      await loadUserData();
    })
  ])));
}

async function loadAdminData() {
  const [{ slots }, { bookings }] = await Promise.all([
    api('/api/admin/slots'), api('/api/admin/bookings')
  ]);

  fillTable('adminSlotsTable', 'adminSlotsEmpty', slots.map((slot) => row([
    formatWhen(slot.startsAt),
    formatLength(slot.startsAt, slot.endsAt),
    slot.bookedBy ? { tag: 'taken', text: slot.bookedBy } : { tag: 'free', text: 'Free' },
    actionButton('Remove', 'danger', async () => {
      await api(`/api/admin/slots/${slot.id}`, { method: 'DELETE' });
      flash('Time slot removed.');
      await loadAdminData();
    })
  ])));

  fillTable('adminBookingsTable', 'adminBookingsEmpty', bookings.map((booking) => row([
    formatWhen(booking.startsAt),
    formatLength(booking.startsAt, booking.endsAt),
    booking.userEmail,
    formatDate(booking.bookedAt)
  ])));
}

async function refresh() {
  render();
  if (!currentUser) return;
  try {
    await (currentUser.role === 'admin' ? loadAdminData() : loadUserData());
  } catch (err) {
    flash(err.message, 'error');
  }
}

/* -------------------------------- events -------------------------------- */

function onSubmit(formId, handler) {
  $(formId).addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFlash();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await handler(data, form);
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });
}

onSubmit('loginForm', async (data, form) => {
  const { user } = await api('/api/auth/login', { method: 'POST', body: data });
  currentUser = user;
  form.reset();
  flash(`Welcome back, ${user.email}.`);
  await refresh();
});

onSubmit('signupForm', async (data, form) => {
  const { user } = await api('/api/auth/signup', { method: 'POST', body: data });
  currentUser = user;
  form.reset();
  flash('Account created. You can book a slot now.');
  await refresh();
});

onSubmit('slotForm', async (data, form) => {
  // datetime-local gives local wall-clock time; send it as UTC so the server
  // and every browser agree on the instant.
  await api('/api/admin/slots', {
    method: 'POST',
    body: {
      startsAt: new Date(data.startsAt).toISOString(),
      endsAt: new Date(data.endsAt).toISOString()
    }
  });
  form.reset();
  flash('Time slot added.');
  await refresh();
});

$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  clearFlash();
  render();
});

/* --------------------------------- boot --------------------------------- */

(async function start() {
  try {
    const { user } = await api('/api/auth/me');
    currentUser = user;
  } catch {
    currentUser = null;
  }
  await refresh();
})();
