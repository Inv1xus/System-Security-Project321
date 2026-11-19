const $ = (id) => document.getElementById(id);
let session = { user: null, csrfToken: null };
let authMode = 'login';

function showMessage(message, error = false) {
  const element = $('message');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = !message;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.method ? { 'Content-Type': 'application/json' } : {}),
      ...(session.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}),
      ...options.headers
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function timeLabel(item) { return `${formatDate(item.startsAt)} – ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.endsAt))}`; }

function empty(container, text) {
  container.replaceChildren();
  const line = document.createElement('p');
  line.className = 'empty';
  line.textContent = text;
  container.append(line);
}

function row(title, detail, buttonText, onClick, danger = false) {
  const element = document.createElement('div');
  element.className = 'row';
  const main = document.createElement('div');
  main.className = 'row-main';
  const heading = document.createElement('div');
  heading.className = 'row-title';
  heading.textContent = title;
  const sub = document.createElement('div');
  sub.className = 'row-detail';
  sub.textContent = detail;
  main.append(heading, sub);
  element.append(main);
  if (buttonText) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${danger ? 'danger' : 'primary'}`;
    button.textContent = buttonText;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await onClick(); showMessage(danger ? 'Updated successfully.' : 'Appointment booked.'); await refresh(); }
      catch (error) { showMessage(error.message, true); }
      finally { button.disabled = false; }
    });
    element.append(button);
  }
  return element;
}

async function refresh() {
  const calls = [request('/api/slots'), request('/api/bookings')];
  if (session.user.role === 'admin') calls.push(request('/api/admin/slots'), request('/api/admin/bookings'));
  const [available, mine, adminSlots, adminBookings] = await Promise.all(calls);
  $('slots').replaceChildren();
  if (!available.slots.length) empty($('slots'), 'No available times right now. Please check back later.');
  for (const slot of available.slots) $('slots').append(row(timeLabel(slot), 'Available', 'Book', () => request('/api/bookings', { method: 'POST', body: JSON.stringify({ slotId: slot.id }) })));

  $('bookings').replaceChildren();
  if (!mine.bookings.length) empty($('bookings'), 'You have no bookings yet.');
  for (const booking of mine.bookings) {
    const active = !booking.cancelledAt;
    const canCancel = active && new Date(booking.startsAt) > new Date();
    $('bookings').append(row(timeLabel(booking), active ? 'Booked' : 'Cancelled', canCancel ? 'Cancel' : null,
      () => request(`/api/bookings/${booking.id}`, { method: 'DELETE', body: '{}' }), true));
  }

  if (adminSlots) {
    $('admin-slots').replaceChildren();
    if (!adminSlots.slots.length) empty($('admin-slots'), 'No upcoming slots.');
    for (const slot of adminSlots.slots) $('admin-slots').append(row(timeLabel(slot), slot.bookingId ? 'Booked' : 'Available', slot.bookingId ? null : 'Remove',
      () => request(`/api/admin/slots/${slot.id}`, { method: 'DELETE', body: '{}' }), true));
    $('admin-bookings').replaceChildren();
    if (!adminBookings.bookings.length) empty($('admin-bookings'), 'No bookings yet.');
    for (const booking of adminBookings.bookings) $('admin-bookings').append(row(timeLabel(booking), `${booking.email} · ${booking.cancelledAt ? 'Cancelled' : 'Booked'}`));
  }
}

async function render() {
  const signedIn = !!session.user;
  $('auth-panel').hidden = signedIn;
  $('app-panel').hidden = !signedIn;
  $('account').hidden = !signedIn;
  if (!signedIn) return;
  $('account-label').textContent = session.user.email;
  $('admin-panel').hidden = session.user.role !== 'admin';
  await refresh();
}

function setAuthMode(mode) {
  authMode = mode;
  $('login-tab').classList.toggle('active', mode === 'login');
  $('signup-tab').classList.toggle('active', mode === 'signup');
  $('login-tab').setAttribute('aria-selected', String(mode === 'login'));
  $('signup-tab').setAttribute('aria-selected', String(mode === 'signup'));
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('auth-submit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  showMessage('');
}

$('login-tab').addEventListener('click', () => setAuthMode('login'));
$('signup-tab').addEventListener('click', () => setAuthMode('signup'));
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('auth-submit');
  button.disabled = true;
  try {
    session = await request(`/api/${authMode}`, { method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
    $('password').value = '';
    showMessage('');
    await render();
  } catch (error) { showMessage(error.message, true); }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  try { await request('/api/logout', { method: 'POST', body: '{}' }); session = { user: null, csrfToken: null }; showMessage('You have logged out.'); await render(); }
  catch (error) { showMessage(error.message, true); }
});
$('refresh').addEventListener('click', () => refresh().catch((error) => showMessage(error.message, true)));
$('slot-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const startsAt = new Date($('starts-at').value).toISOString();
    const endsAt = new Date($('ends-at').value).toISOString();
    await request('/api/admin/slots', { method: 'POST', body: JSON.stringify({ startsAt, endsAt }) });
    $('slot-form').reset();
    showMessage('Slot added.');
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

request('/api/me').then((data) => { session = data; return render(); }).catch((error) => showMessage(error.message, true));
