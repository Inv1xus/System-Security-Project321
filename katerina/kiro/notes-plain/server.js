'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'notes.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL UNIQUE,
    password  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Prepared statements
const stmts = {
  findUser:    db.prepare('SELECT * FROM users WHERE username = ?'),
  createUser:  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),

  listNotes:   db.prepare('SELECT id, title, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC'),
  getNote:     db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?'),
  createNote:  db.prepare('INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)'),
  updateNote:  db.prepare("UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"),
  deleteNote:  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?'),
};

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

const SqliteStore = require('connect-sqlite3')(session);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new SqliteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3–32 characters.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = stmts.findUser.get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken.' });

  const hash = await bcrypt.hash(password, 12);
  const info = stmts.createUser.run(username, hash);

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.userId = info.lastInsertRowid;
    res.json({ username });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = stmts.findUser.get(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid username or password.' });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.userId = user.id;
    res.json({ username: user.username });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = stmts.getUserById.get(req.session.userId);
  res.json({ user: user ? { id: user.id, username: user.username } : null });
});

// ---------------------------------------------------------------------------
// Notes routes
// ---------------------------------------------------------------------------

app.get('/api/notes', requireAuth, (req, res) => {
  const notes = stmts.listNotes.all(req.session.userId);
  res.json(notes);
});

app.post('/api/notes', requireAuth, (req, res) => {
  const { title, body = '' } = req.body;
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required.' });
  }
  const info = stmts.createNote.run(req.session.userId, title.trim(), body);
  const note = stmts.getNote.get(info.lastInsertRowid, req.session.userId);
  res.status(201).json(note);
});

app.get('/api/notes/:id', requireAuth, (req, res) => {
  const note = stmts.getNote.get(Number(req.params.id), req.session.userId);
  if (!note) return res.status(404).json({ error: 'Note not found.' });
  res.json(note);
});

app.put('/api/notes/:id', requireAuth, (req, res) => {
  const { title, body = '' } = req.body;
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required.' });
  }
  const info = stmts.updateNote.run(title.trim(), body, Number(req.params.id), req.session.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Note not found.' });
  const note = stmts.getNote.get(Number(req.params.id), req.session.userId);
  res.json(note);
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  const info = stmts.deleteNote.run(Number(req.params.id), req.session.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Note not found.' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Notes app listening on http://localhost:${PORT}`));
