import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.databaseFile);

// Owner-only, in case the data volume is shared with other containers/users.
try {
  fs.chmodSync(config.databaseFile, 0o600);
} catch {
  /* best effort: some mounts (e.g. SMB) do not support chmod */
}

// WAL gives better concurrency; foreign_keys must be enabled per connection.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL,
    email_norm    TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notes_user_updated
    ON notes(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT    PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    data       TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// Every statement below is parameterized; no SQL string is ever built from input.
export const statements = {
  createUser: db.prepare(
    `INSERT INTO users (email, email_norm, password_hash) VALUES (?, ?, ?) RETURNING id, email, created_at`
  ),
  findUserByEmail: db.prepare(
    `SELECT id, email, password_hash FROM users WHERE email_norm = ?`
  ),
  findUserById: db.prepare(`SELECT id, email, created_at FROM users WHERE id = ?`),

  listNotes: db.prepare(
    `SELECT id, title, content, created_at, updated_at
       FROM notes
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC`
  ),
  // Ownership is part of every WHERE clause: a note id alone is never enough.
  getNote: db.prepare(
    `SELECT id, title, content, created_at, updated_at
       FROM notes WHERE id = ? AND user_id = ?`
  ),
  countNotes: db.prepare(`SELECT COUNT(*) AS count FROM notes WHERE user_id = ?`),
  createNote: db.prepare(
    `INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)
     RETURNING id, title, content, created_at, updated_at`
  ),
  updateNote: db.prepare(
    `UPDATE notes
        SET title = ?, content = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
     RETURNING id, title, content, created_at, updated_at`
  ),
  deleteNote: db.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`),
};

export function closeDatabase() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch {
    /* already closed */
  }
}
