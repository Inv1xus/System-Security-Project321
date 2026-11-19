// Front-end for the private notes app. Plain DOM, no framework.
const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  notes: [],
  mode: 'login', // 'login' | 'signup'
  editingId: null,
};

// --- helpers -------------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body is fine */
  }

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showMessage(text, kind = 'error') {
  const el = $('message');
  el.textContent = text;
  el.className = `message ${kind}`;
  el.hidden = !text;
  if (text) setTimeout(() => { el.hidden = true; }, 4000);
}

function formatDate(value) {
  // SQLite returns "YYYY-MM-DD HH:MM:SS" in UTC.
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// --- rendering -----------------------------------------------------------

function render() {
  const signedIn = Boolean(state.user);

  $('auth-view').hidden = signedIn;
  $('notes-view').hidden = !signedIn;
  $('session').hidden = !signedIn;

  if (signedIn) {
    $('who').textContent = `Signed in as ${state.user.username}`;
    renderNotes();
  }
}

function renderNotes() {
  const list = $('notes');
  list.replaceChildren();

  $('count').textContent = state.notes.length ? `(${state.notes.length})` : '';
  $('empty').hidden = state.notes.length > 0;

  for (const note of state.notes) {
    const li = document.createElement('li');
    li.className = 'note';
    if (note.id === state.editingId) li.classList.add('editing');

    const h3 = document.createElement('h3');
    h3.textContent = note.title; // textContent, so note text is never parsed as HTML

    const body = document.createElement('p');
    body.className = 'note-body';
    body.textContent = note.body;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `Updated ${formatDate(note.updated_at)}`;

    const actions = document.createElement('div');
    actions.className = 'row';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ghost';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => startEdit(note));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteNote(note));

    actions.append(edit, del);
    li.append(h3, body, meta, actions);
    list.append(li);
  }
}

// --- auth ----------------------------------------------------------------

function setAuthMode(mode) {
  state.mode = mode;
  $('tab-login').classList.toggle('active', mode === 'login');
  $('tab-signup').classList.toggle('active', mode === 'signup');
  $('auth-submit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}

async function submitAuth(event) {
  event.preventDefault();
  const username = $('username').value.trim();
  const password = $('password').value;
  const path = state.mode === 'login' ? '/api/auth/login' : '/api/auth/signup';

  try {
    const data = await api(path, { method: 'POST', body: JSON.stringify({ username, password }) });
    state.user = data.user;
    $('auth-form').reset();
    await loadNotes();
    render();
    showMessage(`Welcome, ${data.user.username}.`, 'success');
  } catch (err) {
    showMessage(err.message);
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* log out locally regardless */
  }
  state.user = null;
  state.notes = [];
  resetEditor();
  render();
  showMessage('Logged out.', 'success');
}

// --- notes ---------------------------------------------------------------

async function loadNotes() {
  const data = await api('/api/notes');
  state.notes = data.notes;
}

function resetEditor() {
  state.editingId = null;
  $('note-id').value = '';
  $('note-form').reset();
  $('editor-title').textContent = 'New note';
  $('save-btn').textContent = 'Save note';
  $('cancel-btn').hidden = true;
}

function startEdit(note) {
  state.editingId = note.id;
  $('note-id').value = String(note.id);
  $('title').value = note.title;
  $('body').value = note.body;
  $('editor-title').textContent = 'Edit note';
  $('save-btn').textContent = 'Update note';
  $('cancel-btn').hidden = false;
  $('title').focus();
  renderNotes();
}

async function saveNote(event) {
  event.preventDefault();
  const payload = { title: $('title').value.trim(), body: $('body').value };
  const id = $('note-id').value;

  try {
    if (id) {
      await api(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
    }
    resetEditor();
    await loadNotes();
    renderNotes();
    showMessage(id ? 'Note updated.' : 'Note saved.', 'success');
  } catch (err) {
    showMessage(err.message);
  }
}

async function deleteNote(note) {
  if (!confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
  try {
    await api(`/api/notes/${note.id}`, { method: 'DELETE' });
    if (state.editingId === note.id) resetEditor();
    await loadNotes();
    renderNotes();
    showMessage('Note deleted.', 'success');
  } catch (err) {
    showMessage(err.message);
  }
}

// --- boot ----------------------------------------------------------------

async function init() {
  $('tab-login').addEventListener('click', () => setAuthMode('login'));
  $('tab-signup').addEventListener('click', () => setAuthMode('signup'));
  $('auth-form').addEventListener('submit', submitAuth);
  $('logout-btn').addEventListener('click', logout);
  $('note-form').addEventListener('submit', saveNote);
  $('cancel-btn').addEventListener('click', resetEditor);

  setAuthMode('login');

  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    if (state.user) await loadNotes();
  } catch {
    state.user = null;
  }
  render();
}

init();
