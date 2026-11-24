'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('./config');

let db;

function open() {
  if (db) return db;

  if (config.dbFile !== ':memory:') {
    const dir = path.dirname(path.resolve(config.dbFile));
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.dbFile);

  // WAL for concurrent readers; FULL synchronous so a crash cannot lose a booking.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  // Defence in depth: the app never needs to load extensions or write to disk
  // outside the database file.
  db.pragma('trusted_schema = OFF');

  migrate(db);
  return db;
}

function migrate(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      email          TEXT    NOT NULL,
      password_hash  TEXT    NOT NULL,
      role           TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      failed_logins  INTEGER NOT NULL DEFAULT 0,
      locked_until   TEXT
    );

    -- Emails are stored already lower-cased; the index enforces one account per address.
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT    PRIMARY KEY,          -- sha256(session token)
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_hash     TEXT    NOT NULL,             -- sha256(csrf token)
      created_at    TEXT    NOT NULL,
      last_seen_at  TEXT    NOT NULL,
      expires_at    TEXT    NOT NULL,
      hard_expires_at TEXT  NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS slots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      starts_at   TEXT    NOT NULL,
      ends_at     TEXT    NOT NULL,
      capacity    INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      CHECK (ends_at > starts_at)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS slots_window_unique ON slots (starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS slots_starts_idx ON slots (starts_at);

    CREATE TABLE IF NOT EXISTS bookings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id      INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled')),
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      cancelled_at TEXT
    );

    -- One live booking per user per slot; cancelled rows are kept for history.
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_live_unique
      ON bookings (slot_id, user_id) WHERE status = 'booked';
    CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, status);
    CREATE INDEX IF NOT EXISTS bookings_slot_idx ON bookings (slot_id, status);
  `);
}

function getDb() {
  return open();
}

function close() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { getDb, close };
