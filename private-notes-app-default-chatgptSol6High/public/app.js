const $ = id => document.getElementById(id);
const state = { mode: 'login', notes: [], selectedId: null };

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
  } catch {
    throw new Error('Could not connect to the server. Please try again.');
  }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'Something went wrong.');
  return data;
}

function showMessage(id, message, isError = true) {
  const el = $(id);
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = !message;
}

function setAuthMode(mode) {
  state.mode = mode;
  const signup = mode === 'signup';
  $('auth-title').textContent = signup ? 'Create account' : 'Log in';
  $('auth-description').textContent = signup ? 'A private place for every thought.' : 'Pick up where you left off.';
  $('auth-submit').textContent = signup ? 'Create account' : 'Log in';
  $('auth-switch-label').textContent = signup ? 'Already have an account?' : 'New here?';
  $('auth-switch').textContent = signup ? 'Log in' : 'Create an account';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  showMessage('auth-error', '');
}

function showAuth() {
  $('notes-view').hidden = true;
  $('auth-view').hidden = false;
  state.notes = [];
  state.selectedId = null;
}

async function showNotes(user) {
  $('account-email').textContent = user.email;
  $('auth-view').hidden = true;
  $('notes-view').hidden = false;
  await loadNotes();
}

function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? '' : `Last edited ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)}`;
}

function renderList() {
  const list = $('note-list');
  list.replaceChildren();
  $('note-count').textContent = String(state.notes.length);
  if (!state.notes.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'No notes yet. Start with a new one.';
    list.append(empty);
    return;
  }
  for (const note of state.notes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `note-link${note.id === state.selectedId ? ' active' : ''}`;
    button.setAttribute('aria-current', note.id === state.selectedId ? 'page' : 'false');
    const title = document.createElement('span');
    title.className = 'note-link-title';
    title.textContent = note.title;
    const preview = document.createElement('span');
    preview.className = 'note-link-preview';
    preview.textContent = note.body.trim().replace(/\s+/g, ' ') || 'Empty note';
    button.append(title, preview);
    button.addEventListener('click', () => selectNote(note.id));
    list.append(button);
  }
}

async function loadNotes() {
  try {
    const data = await request('/api/notes');
    state.notes = data.notes;
    renderList();
    if (state.selectedId === null) showEmpty();
    else {
      const selected = state.notes.find(note => note.id === state.selectedId);
      if (selected) displayNote(selected);
      else showEmpty();
    }
  } catch (error) {
    if (error.message === 'Please log in.') showAuth();
    else showMessage('note-message', error.message);
  }
}

function showEmpty() {
  state.selectedId = null;
  $('empty-state').hidden = false;
  $('note-form').hidden = true;
  renderList();
}

function displayNote(note) {
  state.selectedId = note.id;
  $('empty-state').hidden = true;
  $('note-form').hidden = false;
  $('edit-status').textContent = 'EDITING NOTE';
  $('note-title').value = note.title;
  $('note-body').value = note.body;
  $('note-date').textContent = dateLabel(note.updated_at);
  $('delete-note').hidden = false;
  showMessage('note-message', '');
  renderList();
}

function selectNote(id) {
  const note = state.notes.find(item => item.id === id);
  if (note) displayNote(note);
}

function newNote() {
  state.selectedId = null;
  $('empty-state').hidden = true;
  $('note-form').hidden = false;
  $('edit-status').textContent = 'NEW NOTE';
  $('note-title').value = '';
  $('note-body').value = '';
  $('note-date').textContent = '';
  $('delete-note').hidden = true;
  showMessage('note-message', '');
  renderList();
  $('note-title').focus();
}

$('auth-switch').addEventListener('click', () => setAuthMode(state.mode === 'login' ? 'signup' : 'login'));
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('auth-submit');
  button.disabled = true;
  showMessage('auth-error', '');
  try {
    const { user } = await request(`/api/auth/${state.mode}`, {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value, password: $('password').value })
    });
    $('password').value = '';
    await showNotes(user);
  } catch (error) {
    showMessage('auth-error', error.message);
  } finally {
    button.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', { method: 'POST', body: '{}' });
    showAuth();
    setAuthMode('login');
  } catch (error) {
    showMessage('note-message', error.message);
  }
});

$('new-note').addEventListener('click', newNote);
$('empty-new-note').addEventListener('click', newNote);

$('note-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('save-note');
  button.disabled = true;
  showMessage('note-message', '');
  try {
    const id = state.selectedId;
    const { note } = await request(id === null ? '/api/notes' : `/api/notes/${id}`, {
      method: id === null ? 'POST' : 'PUT',
      body: JSON.stringify({ title: $('note-title').value, body: $('note-body').value })
    });
    state.selectedId = note.id;
    await loadNotes();
    showMessage('note-message', 'Saved.', false);
  } catch (error) {
    showMessage('note-message', error.message);
  } finally {
    button.disabled = false;
  }
});

$('delete-note').addEventListener('click', async () => {
  if (state.selectedId === null || !window.confirm('Delete this note? This cannot be undone.')) return;
  try {
    await request(`/api/notes/${state.selectedId}`, { method: 'DELETE', body: '{}' });
    state.selectedId = null;
    await loadNotes();
  } catch (error) {
    showMessage('note-message', error.message);
  }
});

(async () => {
  try {
    const { user } = await request('/api/auth/me');
    await showNotes(user);
  } catch {
    showAuth();
  }
})();
