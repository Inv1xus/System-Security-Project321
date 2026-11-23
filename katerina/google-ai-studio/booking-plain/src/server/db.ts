import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'appointments.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slot_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TEXT NOT NULL,
    cancelled_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
    ON bookings(slot_id)
    WHERE status = 'confirmed';

  CREATE INDEX IF NOT EXISTS idx_time_slots_date_time
    ON time_slots(slot_date, start_time);

  CREATE INDEX IF NOT EXISTS idx_bookings_user
    ON bookings(user_id, created_at);
`);

export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  const existing = db
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .get('session_secret') as { value: string } | undefined;
  if (existing) {
    return existing.value;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('session_secret', generated);
  return generated;
}

function formatDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function seedInitialData(): void {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const adminHash = bcrypt.hashSync('admin1234', 10);
  const userHash = bcrypt.hashSync('user1234', 10);

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const adminResult = insertUser.run('Elena Vance', 'admin@cadence.local', adminHash, 'admin', now);
  const userResult = insertUser.run('Alex Mercer', 'alex@cadence.local', userHash, 'user', now);

  const adminId = Number(adminResult.lastInsertRowid);
  const userId = Number(userResult.lastInsertRowid);

  const insertSlot = db.prepare(
    'INSERT INTO time_slots (title, slot_date, start_time, end_time, location, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const d0 = formatDateOffset(0);
  const d1 = formatDateOffset(1);
  const d2 = formatDateOffset(2);
  const d3 = formatDateOffset(3);

  const slots: Array<[string, string, string, string, string]> = [
    ['Initial Consultation', d0, '10:00', '10:45', 'Room 204'],
    ['Project Architecture Review', d0, '14:00', '14:45', 'Video Call'],
    ['Strategy Session', d1, '09:30', '10:15', 'Room 204'],
    ['Design Critique', d1, '11:00', '11:45', 'Studio B'],
    ['Technical Onboarding', d1, '15:00', '15:45', 'Video Call'],
    ['Quarterly Check-in', d2, '10:00', '10:45', 'Room 101'],
    ['Portfolio Review', d2, '13:30', '14:15', 'Studio B'],
    ['Follow-up Workshop', d3, '09:00', '10:00', 'Room 204'],
    ['Discovery Call', d3, '11:30', '12:00', 'Video Call'],
  ];

  const createdSlotIds: number[] = [];
  for (const [title, date, start, end, location] of slots) {
    const res = insertSlot.run(title, date, start, end, location, adminId, now);
    createdSlotIds.push(Number(res.lastInsertRowid));
  }

  const insertBooking = db.prepare(
    'INSERT INTO bookings (slot_id, user_id, notes, status, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  if (createdSlotIds.length >= 4) {
    insertBooking.run(
      createdSlotIds[0],
      userId,
      'Reviewing onboarding timeline and Q4 milestones.',
      'confirmed',
      now
    );
    insertBooking.run(
      createdSlotIds[3],
      userId,
      'Bringing updated wireframes for feedback.',
      'confirmed',
      now
    );
  }
}
