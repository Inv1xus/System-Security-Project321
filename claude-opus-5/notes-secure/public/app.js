'use strict';

/**
 * Front-end for Private Notes.
 *
 * Security notes:
 *  - All user-supplied text is inserted with textContent / value, never
 *    innerHTML, so note contents can never execute as markup.
 *  - Every state-changing request carries the session CSRF token in a custom
 *    header; the session cookie itself is HttpOnly and never touched here.
 */

const $ = (id) => document.getElementById(id);

const el = {
  sessionBar: $('session-bar'),
  currentUser: $('current-user'),
  logoutButton: $('logout-button'),
  authView: $('auth-view'),
  authForm: $('auth-form'),
  authSubmit: $('auth-submit'),
  tabLogin: $('tab-login'),
  tabSignup: $('tab-signup'),
  email: $('email'),
  password: $('password'),
  passwordHint: $('password-hint'),
  notesView: $('notes-view'),
  notesList: $('notes-list'),
  notesEmpty: $('notes-empty'),
  newNote: $('new-note'),
  noteForm: $('note-form'),
  noteTitle: $('note-title'),
  noteContent: $('note-content'),
  saveNote: $('save-note'),
  deleteNote: $('delete-note'),
  cancelEdit: $('cancel-edit'),
  noteMeta: $('note-meta'),
  status: $('status'),
};

const state = {
  mode: 'login',
  user: null,
  notes: [],
  selectedId: null,
  csrfToken: null,
};

/* ------------------------------------------------------------------ utils */

function setStatus(message, kind = 'info') {
  if (!message) {
    el.status.hidden = true;
    el.status.textContent = '';
    return;
  }
  el.status.hidden = false;
  el.status.textContent = message; // textContent: no markup injection
  el.status.className = `status status--${kind}`;
}

function formatDate(value) {
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

async function refreshCsrfToken() {
  const res = await fetch('/api/csrf', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not establish a secure session.');
  const data = await res.json();
  state.csrfToken = data.csrfToken;
  return state.csrfToken;
}

async function api(pathname, { method = 'GET', body, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  const options = { method, headers, credentials: 'same-origin' };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = state.csrfToken || (await refreshCsrfToken());
  }

  const res = await fetch(pathname, options);

  // The token rotates whenever the session is rebuilt (login/logout); fetch a
  // fresh one and retry exactly once before surfacing an error.
  if (res.status === 403 && retry && method !== 'GET') {
    await refreshCsrfToken();
    return api(pathname, { method, body, retry: false });
  }

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ------------------------------------------------------------- auth view */

function setAuthMode(mode) {
  state.mode = mode;
  const isSignup = mode === 'signup';
  el.tabLogin.classList.toggle('is-active', !isSignup);
  el.tabSignup.classList.toggle('is-active', isSignup);
  el.authSubmit.textContent = isSignup ? 'Create account' : 'Log in';
  el.password.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  el.passwordHint.hidden = !isSignup;
  setStatus('');
}

function showSignedOut() {
  state.user = null;
  state.notes = [];
  state.selectedId = null;
  el.authView.hidden = false;
  el.notesView.hidden = true;
  el.sessionBar.hidden = true;
  el.currentUser.textContent = '';
  el.notesList.replaceChildren();
  el.authForm.reset();
}

function showSignedIn(user) {
  state.user = user;
  el.authView.hidden = true;
  el.notesView.hidden = false;
  el.sessionBar.hidden = false;
  el.currentUser.textContent = user.email; // textContent, not innerHTML
  el.authForm.reset();
}

/* ------------------------------------------------------------ notes view */

function renderNotes() {
  el.notesList.replaceChildren();
  el.notesEmpty.hidden = state.notes.length > 0;

  for (const note of state.notes) {
    const item = document.createElement('li');
    item.className = 'note-item' + (note.id === state.selectedId ? ' is-selected' : '');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-button';
    button.dataset.id = String(note.id);

    const title = document.createElement('span');
    title.className = 'note-title';
    title.textContent = note.title;

    const preview = document.createElement('span');
    preview.className = 'note-preview';
    preview.textContent = note.content.slice(0, 80).replace(/\s+/g, ' ').trim();

    const when = document.createElement('time');
    when.className = 'note-when';
    when.textContent = formatDate(note.updated_at);

    button.append(title, preview, when);
    item.append(button);
    el.notesList.append(item);
  }
}

function selectNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  state.selectedId = note.id;
  el.noteTitle.value = note.title;
  el.noteContent.value = note.content;
  el.deleteNote.hidden = false;
  el.noteMeta.textContent = `Updated ${formatDate(note.updated_at)}`;
  renderNotes();
}

function clearEditor() {
  state.selectedId = null;
  el.noteTitle.value = '';
  el.noteContent.value = '';
  el.deleteNote.hidden = true;
  el.noteMeta.textContent = '';
  renderNotes();
}

async function loadNotes() {
  const data = await api('/api/notes');
  state.notes = Array.isArray(data?.notes) ? data.notes : [];
  if (!state.notes.some((n) => n.id === state.selectedId)) clearEditor();
  else renderNotes();
}

/* -------------------------------------------------------------- handlers */

el.tabLogin.addEventListener('click', () => setAuthMode('login'));
el.tabSignup.addEventListener('click', () => setAuthMode('signup'));

el.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.authSubmit.disabled = true;
  setStatus('');

  try {
    const endpoint = state.mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const data = await api(endpoint, {
      method: 'POST',
      body: { email: el.email.value, password: el.password.value },
    });
    await refreshCsrfToken(); // session was regenerated on login
    showSignedIn(data.user);
    await loadNotes();
    setStatus(`Signed in as ${data.user.email}`, 'ok');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    el.authSubmit.disabled = false;
  }
});

el.logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* log out locally regardless */
  }
  state.csrfToken = null;
  showSignedOut();
  setAuthMode('login');
  await refreshCsrfToken().catch(() => {});
  setStatus('Logged out.', 'ok');
});

el.notesList.addEventListener('click', (event) => {
  const button = event.target.closest('.note-button');
  if (!button) return;
  selectNote(Number(button.dataset.id));
});

el.newNote.addEventListener('click', () => {
  clearEditor();
  el.noteTitle.focus();
});

el.cancelEdit.addEventListener('click', () => {
  clearEditor();
  setStatus('');
});

el.noteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.saveNote.disabled = true;

  const payload = { title: el.noteTitle.value, content: el.noteContent.value };
  try {
    if (state.selectedId) {
      const data = await api(`/api/notes/${state.selectedId}`, { method: 'PUT', body: payload });
      setStatus('Note updated.', 'ok');
      state.selectedId = data.note.id;
    } else {
      const data = await api('/api/notes', { method: 'POST', body: payload });
      setStatus('Note created.', 'ok');
      state.selectedId = data.note.id;
    }
    await loadNotes();
    selectNote(state.selectedId);
  } catch (err) {
    if (err.status === 401) return handleSignedOut();
    setStatus(err.message, 'error');
  } finally {
    el.saveNote.disabled = false;
  }
});

el.deleteNote.addEventListener('click', async () => {
  if (!state.selectedId) return;
  const note = state.notes.find((n) => n.id === state.selectedId);
  if (!window.confirm(`Delete "${note ? note.title : 'this note'}"? This cannot be undone.`)) return;

  try {
    await api(`/api/notes/${state.selectedId}`, { method: 'DELETE' });
    clearEditor();
    await loadNotes();
    setStatus('Note deleted.', 'ok');
  } catch (err) {
    if (err.status === 401) return handleSignedOut();
    setStatus(err.message, 'error');
  }
});

async function handleSignedOut() {
  state.csrfToken = null;
  showSignedOut();
  setAuthMode('login');
  await refreshCsrfToken().catch(() => {});
  setStatus('Your session expired. Please log in again.', 'error');
}

/* ------------------------------------------------------------------ boot */

(async function init() {
  setAuthMode('login');
  try {
    await refreshCsrfToken();
    const data = await api('/api/auth/me');
    showSignedIn(data.user);
    await loadNotes();
  } catch {
    showSignedOut();
  }
})();
