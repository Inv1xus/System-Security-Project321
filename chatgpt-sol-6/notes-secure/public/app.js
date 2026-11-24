const $ = (id) => document.getElementById(id);
const state = { csrfToken: null, notes: [], selectedId: null, mode: 'login' };

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.csrfToken && options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = state.csrfToken;
  }
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function message(text) { $('message').textContent = text; }

function showWorkspace(email) {
  $('account-email').textContent = email;
  $('account').hidden = false;
  $('auth-view').hidden = true;
  $('notes-view').hidden = false;
}

function showAuth() {
  $('account').hidden = true;
  $('account-email').textContent = '';
  $('auth-view').hidden = false;
  $('notes-view').hidden = true;
  $('auth-form').reset();
  $('note-form').reset();
  $('note-form').hidden = true;
  $('notes-list').replaceChildren();
  $('editor-status').textContent = '';
  state.csrfToken = null;
  state.notes = [];
  state.selectedId = null;
}

function setMode(mode) {
  state.mode = mode;
  const signup = mode === 'signup';
  $('auth-heading').textContent = signup ? 'Create your account' : 'Welcome back';
  $('auth-description').textContent = signup ? 'Your notes belong to you.' : 'Log in to see your notes.';
  $('auth-submit').textContent = signup ? 'Create account' : 'Log in';
  $('switch-prompt').textContent = signup ? 'Already have an account?' : 'New here?';
  $('switch-auth').textContent = signup ? 'Log in' : 'Create an account';
  $('password-hint').hidden = !signup;
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  message('');
}

function renderList() {
  const list = $('notes-list');
  list.replaceChildren();
  $('empty-list').hidden = state.notes.length !== 0;
  for (const note of state.notes) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-item' + (note.id === state.selectedId ? ' selected' : '');
    const title = document.createElement('strong');
    title.textContent = note.title;
    const preview = document.createElement('span');
    preview.textContent = note.body.trim() || 'Empty note';
    button.append(title, preview);
    button.addEventListener('click', () => selectNote(note.id));
    item.append(button);
    list.append(item);
  }
}

function selectNote(id) {
  const note = state.notes.find((entry) => entry.id === id);
  if (!note) return;
  state.selectedId = id;
  $('note-title').value = note.title;
  $('note-body').value = note.body;
  $('editor-status').textContent = 'Last saved ' + new Date(note.updated_at + 'Z').toLocaleString();
  $('delete-note').hidden = false;
  $('editor-placeholder').hidden = true;
  $('note-form').hidden = false;
  renderList();
}

function newNote() {
  state.selectedId = null;
  $('note-form').reset();
  $('editor-status').textContent = 'New note';
  $('delete-note').hidden = true;
  $('editor-placeholder').hidden = true;
  $('note-form').hidden = false;
  renderList();
  $('note-title').focus();
}

async function loadNotes() {
  const data = await request('/api/notes');
  state.notes = data.notes;
  renderList();
  if (state.selectedId !== null) selectNote(state.selectedId);
}

$('switch-auth').addEventListener('click', () => setMode(state.mode === 'login' ? 'signup' : 'login'));
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('auth-submit');
  button.disabled = true;
  message('');
  try {
    const data = await request('/api/' + state.mode, {
      method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value })
    });
    state.csrfToken = data.csrfToken;
    showWorkspace(data.user.email);
    await loadNotes();
  } catch (error) { message(error.message); }
  finally { button.disabled = false; }
});

$('logout').addEventListener('click', async () => {
  try { await request('/api/logout', { method: 'POST', body: '{}' }); showAuth(); message('Logged out.'); }
  catch (error) { message(error.message); }
});
$('new-note').addEventListener('click', newNote);

$('note-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('save-note');
  button.disabled = true;
  message('');
  try {
    const editing = state.selectedId !== null;
    const data = await request(editing ? `/api/notes/${state.selectedId}` : '/api/notes', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify({ title: $('note-title').value, body: $('note-body').value })
    });
    state.selectedId = data.note.id;
    await loadNotes();
    message('Note saved.');
  } catch (error) { message(error.message); }
  finally { button.disabled = false; }
});

$('delete-note').addEventListener('click', async () => {
  if (state.selectedId === null || !window.confirm('Delete this note?')) return;
  try {
    await request(`/api/notes/${state.selectedId}`, { method: 'DELETE', body: '{}' });
    state.selectedId = null;
    $('note-form').hidden = true;
    $('editor-placeholder').hidden = false;
    await loadNotes();
    message('Note deleted.');
  } catch (error) { message(error.message); }
});

request('/api/me').then(async (data) => {
  state.csrfToken = data.csrfToken;
  showWorkspace(data.user.email);
  await loadNotes();
}).catch(() => showAuth());
