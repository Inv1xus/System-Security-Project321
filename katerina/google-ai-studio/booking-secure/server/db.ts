import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from './config.ts';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);

// Configure SQLite for production reliability and concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'admin')) DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')) DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      cancelled_at TEXT
    );

    -- Enforce at the database layer that a slot can have at most one active confirmed booking
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
      ON bookings(slot_id)
      WHERE status = 'confirmed';

    CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_time_slots_start_time ON time_slots(start_time);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  bootstrapAdminFromEnv();
  seedInitialSlotsIfEmpty();
  purgeExpiredSessions();
}

function bootstrapAdminFromEnv(): void {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME?.trim() || 'Administrator';

  if (!adminEmail || !adminPassword) {
    return;
  }

  if (adminPassword.length < 8) {
    console.warn('[security] ADMIN_PASSWORD must be at least 8 characters; skipping env admin seed.');
    return;
  }

  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: number } | undefined;

  if (existingAdmin) {
    return;
  }

  const existingByEmail = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(adminEmail) as { id: number } | undefined;

  if (existingByEmail) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingByEmail.id);
    return;
  }

  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run(adminName, adminEmail, passwordHash);
  console.info(`[auth] Seeded initial admin user from environment (${adminEmail}).`);
}

function seedInitialSlotsIfEmpty(): void {
  const slotCount = db.prepare('SELECT COUNT(*) AS count FROM time_slots').get() as { count: number };
  if (slotCount.count > 0) {
    return;
  }

  const now = new Date();
  const templates = [
    { dayOffset: 1, hour: 9, minute: 0, durationMin: 30, title: 'Initial Consultation', description: 'One-on-one intake review and requirements scoping.' },
    { dayOffset: 1, hour: 10, minute: 30, durationMin: 45, title: 'Architecture Review', description: 'System design walkthrough and capacity planning.' },
    { dayOffset: 1, hour: 14, minute: 0, durationMin: 30, title: 'Account Onboarding', description: 'Guided workspace setup and permissions walkthrough.' },
    { dayOffset: 2, hour: 9, minute: 30, durationMin: 60, title: 'Strategy Workshop', description: 'Quarterly roadmap alignment and milestone scheduling.' },
    { dayOffset: 2, hour: 13, minute: 0, durationMin: 30, title: 'Technical Check-In', description: 'Focused troubleshooting and integration Q&A.' },
    { dayOffset: 2, hour: 15, minute: 30, durationMin: 45, title: 'Implementation Advisory', description: 'Hands-on implementation guidance with a specialist.' },
    { dayOffset: 3, hour: 10, minute: 0, durationMin: 30, title: 'Initial Consultation', description: 'One-on-one intake review and requirements scoping.' },
    { dayOffset: 3, hour: 11, minute: 30, durationMin: 45, title: 'Security & Compliance Review', description: 'Pre-launch readiness check and operational review.' },
    { dayOffset: 4, hour: 9, minute: 0, durationMin: 60, title: 'Executive Briefing', description: 'Deep-dive planning session for upcoming deliverables.' },
  ];

  const insertStmt = db.prepare(
    'INSERT INTO time_slots (title, description, start_time, end_time) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction(() => {
    for (const item of templates) {
      const start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + item.dayOffset,
          item.hour + 8, // Aligned near daytime US/EU overlap hours in UTC
          item.minute,
          0,
          0
        )
      );
      const end = new Date(start.getTime() + item.durationMin * 60_000);
      insertStmt.run(item.title, item.description, start.toISOString(), end.toISOString());
    }
  });

  insertMany();
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

export function hasAnyAdmin(): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { found: number } | undefined;
  return Boolean(row);
}
