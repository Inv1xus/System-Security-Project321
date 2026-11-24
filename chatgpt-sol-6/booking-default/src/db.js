import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'appointments.db'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS slots_start_idx ON slots(starts_at);
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      cancelled_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_slot
      ON bookings(slot_id) WHERE cancelled_at IS NULL;
    CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id);
  `);
  return db;
}
