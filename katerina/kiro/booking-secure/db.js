'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'booking.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password  TEXT    NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'user'
              CHECK(role IN ('user', 'admin'))
  );

  CREATE TABLE IF NOT EXISTS slots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time TEXT    NOT NULL UNIQUE,
    duration   INTEGER NOT NULL DEFAULT 30,
    available  INTEGER NOT NULL DEFAULT 1
              CHECK(available IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    slot_id    INTEGER NOT NULL REFERENCES slots(id)  ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(slot_id)
  );
`);

// Seed admin if absent (password overridden via ADMIN_PASSWORD env var at startup)
const seedAdmin = db.transaction(() => {
  const exists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!exists) {
    const bcrypt = require('bcrypt');
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      console.error('FATAL: ADMIN_PASSWORD environment variable is not set.');
      process.exit(1);
    }
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(
      "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')"
    ).run('admin', hash);
    console.log('Admin account created.');
  }
});
seedAdmin();

module.exports = db;
