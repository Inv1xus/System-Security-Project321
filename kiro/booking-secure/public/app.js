'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser = null;

  // ── Utility ───────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function showMsg(id, text, type = 'error') {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `msg msg-${type}`;
    el.classList.toggle('hidden', !text);
  }

  function clearMsg(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.className = '';
  }

  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
  }

  function fmtTime(dt) {
    if (!dt) return '';
    return new Date(dt).toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  function showAuthTab(tab) {
    document.getElementById('tab-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('tab-register').classList.toggle('hidden', tab !== 'register');
    document.querySelectorAll('#auth-tabs .tab').forEach((b, i) => {
      b.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
    });
  }

  async function doLogin() {
    clearMsg('msg-login');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const { ok, data } = await api('POST', '/api/auth/login', { username, password });
    if (!ok) return showMsg('msg-login', data.error || 'Login failed.');
    currentUser = data.user;
    onLoggedIn();
  }

  async function doRegister() {
    clearMsg('msg-register');
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const { ok, data } = await api('POST', '/api/auth/register', { username, password });
    if (!ok) return showMsg('msg-register', data.error || 'Registration failed.');
    currentUser = data.user;
    onLoggedIn();
  }

  async function doLogout() {
    await api('POST', '/api/auth/logout');
    currentUser = null;
    document.getElementById('section-auth').classList.remove('hidden');
    document.getElementById('section-app').classList.add('hidden');
    document.getElementById('nav-user').classList.add('hidden');
  }

  document.getElementById('btn-logout').addEventListener('click', doLogout);

  function onLoggedIn() {
    document.getElementById('section-auth').classList.add('hidden');
    document.getElementById('section-app').classList.remove('hidden');
    document.getElementById('nav-user').classList.remove('hidden');
    document.getElementById('nav-username').textContent = currentUser.username;

    if (currentUser.role === 'admin') {
      document.getElementById('tab-admin').classList.remove('hidden');
    }

    switchTab('available');
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS = ['available', 'mybookings', 'admin'];

  function switchTab(name) {
    TABS.forEach(t => {
      document.getElementById(`pane-${t}`).classList.toggle('hidden', t !== name);
    });
    document.querySelectorAll('.tab-bar .tab').forEach(b => {
      b.classList.toggle('active', b.textContent.trim().toLowerCase().startsWith(
        name === 'mybookings' ? 'my' : name === 'admin' ? 'admin' : 'available'
      ));
    });
    if (name === 'available')    loadSlots();
    if (name === 'mybookings')   loadMyBookings();
    if (name === 'admin')        loadAdminData();
  }

  // ── Available Slots ───────────────────────────────────────────────────────

  async function loadSlots() {
    clearMsg('msg-slots');
    const { ok, data } = await api('GET', '/api/slots');
    const tbody = document.getElementById('slots-tbody');
    tbody.innerHTML = '';
    if (!ok) return showMsg('msg-slots', data.error || 'Could not load slots.');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:var(--muted)">No available slots.</td></tr>';
      return;
    }
    for (const s of data) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${escHtml(fmtTime(s.start_time))}</td>` +
        `<td>${escHtml(String(s.duration))} min</td>` +
        `<td><button class="btn btn-primary btn-sm" data-action="book-slot" data-id="${Number(s.id)}">Book</button></td>`;
      tbody.appendChild(tr);
    }
  }

  async function bookSlot(slotId) {
    clearMsg('msg-slots');
    const { ok, data } = await api('POST', '/api/bookings', { slot_id: slotId });
    if (!ok) return showMsg('msg-slots', data.error || 'Could not book slot.');
    showMsg('msg-slots', 'Booking confirmed!', 'success');
    loadSlots();
  }

  // ── My Bookings ───────────────────────────────────────────────────────────

  async function loadMyBookings() {
    clearMsg('msg-mybookings');
    const { ok, data } = await api('GET', '/api/bookings');
    const tbody = document.getElementById('bookings-tbody');
    tbody.innerHTML = '';
    if (!ok) return showMsg('msg-mybookings', data.error || 'Could not load bookings.');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No bookings yet.</td></tr>';
      return;
    }
    for (const b of data) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${escHtml(fmtTime(b.start_time))}</td>` +
        `<td>${escHtml(String(b.duration))} min</td>` +
        `<td>${escHtml(fmtTime(b.created_at))}</td>` +
        `<td><button class="btn btn-danger btn-sm" data-action="cancel-my-booking" data-id="${Number(b.id)}">Cancel</button></td>`;
      tbody.appendChild(tr);
    }
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  async function loadAdminData() {
    await Promise.all([loadAdminBookings(), loadAdminSlots()]);
  }

  async function loadAdminBookings() {
    clearMsg('msg-admin');
    const { ok, data } = await api('GET', '/api/bookings');
    const tbody = document.getElementById('admin-bookings-tbody');
    tbody.innerHTML = '';
    if (!ok) return showMsg('msg-admin', data.error || 'Could not load bookings.');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">No bookings yet.</td></tr>';
      return;
    }
    for (const b of data) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${escHtml(b.username)}</td>` +
        `<td>${escHtml(fmtTime(b.start_time))}</td>` +
        `<td>${escHtml(String(b.duration))} min</td>` +
        `<td>${escHtml(fmtTime(b.created_at))}</td>` +
        `<td><button class="btn btn-danger btn-sm" data-action="cancel-admin-booking" data-id="${Number(b.id)}">Cancel</button></td>`;
      tbody.appendChild(tr);
    }
  }

  async function loadAdminSlots() {
    const { ok, data } = await api('GET', '/api/slots/all');
    const tbody = document.getElementById('admin-slots-tbody');
    tbody.innerHTML = '';
    if (!ok) return;
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No slots created yet.</td></tr>';
      return;
    }
    for (const s of data) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${escHtml(fmtTime(s.start_time))}</td>` +
        `<td>${escHtml(String(s.duration))} min</td>` +
        `<td>${s.available
          ? '<span class="badge">Available</span>'
          : '<span class="badge" style="background:#fee2e2;color:#991b1b">Booked</span>'
        }</td>` +
        `<td><button class="btn btn-danger btn-sm" data-action="delete-slot" data-id="${Number(s.id)}">Remove</button></td>`;
      tbody.appendChild(tr);
    }
  }

  async function addSlot() {
    clearMsg('msg-admin-add');
    const rawTime = document.getElementById('admin-slot-time').value;
    const duration = parseInt(document.getElementById('admin-slot-dur').value, 10);

    if (!rawTime) return showMsg('msg-admin-add', 'Please select a date and time.');
    if (!Number.isFinite(duration)) return showMsg('msg-admin-add', 'Invalid duration.');

    // Convert datetime-local value to an ISO string without timezone offset
    const start_time = rawTime.replace('T', 'T'); // already ISO-like from datetime-local
    const { ok, data } = await api('POST', '/api/slots', { start_time, duration });
    if (!ok) return showMsg('msg-admin-add', data.error || 'Could not add slot.');
    showMsg('msg-admin-add', 'Slot added.', 'success');
    loadAdminSlots();
  }

  async function deleteSlot(slotId) {
    clearMsg('msg-admin');
    const { ok, data } = await api('DELETE', `/api/slots/${Number(slotId)}`);
    if (!ok) return showMsg('msg-admin', data.error || 'Could not remove slot.');
    showMsg('msg-admin', 'Slot removed.', 'success');
    loadAdminData();
  }

  async function cancelBooking(bookingId, context) {
    const msgId = context === 'admin' ? 'msg-admin' : 'msg-mybookings';
    clearMsg(msgId);
    const { ok, data } = await api('DELETE', `/api/bookings/${Number(bookingId)}`);
    if (!ok) return showMsg(msgId, data.error || 'Could not cancel booking.');
    showMsg(msgId, 'Booking cancelled.', 'success');
    if (context === 'admin') loadAdminData(); else loadMyBookings();
  }

  // ── Restore session on page load ──────────────────────────────────────────
  (async () => {
    const { ok, data } = await api('GET', '/api/auth/me');
    if (ok && data.id) {
      currentUser = data;
      onLoggedIn();
    }
  })();


// CSP-compatible event handling.
document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = Number(button.dataset.id);

  switch (action) {
    case 'auth-login': showAuthTab('login'); break;
    case 'auth-register': showAuthTab('register'); break;
    case 'login': doLogin(); break;
    case 'register': doRegister(); break;
    case 'tab-available': switchTab('available'); break;
    case 'tab-mybookings': switchTab('mybookings'); break;
    case 'tab-admin': switchTab('admin'); break;
    case 'add-slot': addSlot(); break;
    case 'book-slot': bookSlot(id); break;
    case 'cancel-my-booking': cancelBooking(id, 'mybookings'); break;
    case 'cancel-admin-booking': cancelBooking(id, 'admin'); break;
    case 'delete-slot': deleteSlot(id); break;
  }
});
