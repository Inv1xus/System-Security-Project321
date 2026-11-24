import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { db, seedInitialData } from './src/server/db.ts';
import {
  attachUser,
  clearSessionCookie,
  createSessionToken,
  requireAdmin,
  requireAuth,
  setSessionCookie,
} from './src/server/auth.ts';
import type { AuthenticatedRequest, AuthUser } from './src/server/auth.ts';

seedInitialData();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Sign up
app.post('/api/auth/signup', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (name.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, passwordHash, 'user', now);

  const user: AuthUser = {
    id: Number(result.lastInsertRowid),
    name,
    email,
    role: 'user',
  };

  const token = createSessionToken(user.id);
  setSessionCookie(res, req, token);
  res.status(201).json({ user });
});

// Log in
app.post('/api/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db
    .prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ?')
    .get(email) as (AuthUser & { password_hash: string }) | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const user: AuthUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
  };

  const token = createSessionToken(user.id);
  setSessionCookie(res, req, token);
  res.json({ user });
});

// Log out
app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

// Current authenticated user
app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  res.json({ user: req.user });
});

// List time slots (with active booking state)
app.get('/api/slots', (req: AuthenticatedRequest, res) => {
  const dateFilter = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const currentUserId = req.user?.id ?? null;
  const isAdmin = req.user?.role === 'admin';

  const baseQuery = `
    SELECT
      ts.id,
      ts.title,
      ts.slot_date,
      ts.start_time,
      ts.end_time,
      ts.location,
      ts.created_at,
      b.id AS active_booking_id,
      b.user_id AS active_booking_user_id,
      b.notes AS active_booking_notes,
      u.name AS booked_by_name,
      u.email AS booked_by_email
    FROM time_slots ts
    LEFT JOIN bookings b
      ON b.slot_id = ts.id AND b.status = 'confirmed'
    LEFT JOIN users u
      ON u.id = b.user_id
    ${dateFilter ? 'WHERE ts.slot_date = ?' : ''}
    ORDER BY ts.slot_date ASC, ts.start_time ASC, ts.id ASC
  `;

  interface SlotRow {
    id: number;
    title: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    location: string;
    created_at: string;
    active_booking_id: number | null;
    active_booking_user_id: number | null;
    active_booking_notes: string | null;
    booked_by_name: string | null;
    booked_by_email: string | null;
  }

  const rows = (
    dateFilter
      ? db.prepare(baseQuery).all(dateFilter)
      : db.prepare(baseQuery).all()
  ) as SlotRow[];

  const slots = rows.map((row) => {
    const isBooked = row.active_booking_id !== null;
    const bookedByMe = currentUserId !== null && row.active_booking_user_id === currentUserId;
    return {
      id: row.id,
      title: row.title,
      slot_date: row.slot_date,
      start_time: row.start_time,
      end_time: row.end_time,
      location: row.location,
      created_at: row.created_at,
      is_booked: isBooked,
      booked_by_me: bookedByMe,
      active_booking_id: bookedByMe || isAdmin ? row.active_booking_id : null,
      booked_by_name: isAdmin ? row.booked_by_name : null,
      booked_by_email: isAdmin ? row.booked_by_email : null,
      booking_notes: isAdmin ? row.active_booking_notes : null,
    };
  });

  res.json({ slots });
});

// Admin: Create a time slot
app.post('/api/slots', requireAdmin, (req: AuthenticatedRequest, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const slotDate = typeof req.body?.slot_date === 'string' ? req.body.slot_date.trim() : '';
  const startTime = typeof req.body?.start_time === 'string' ? req.body.start_time.trim() : '';
  const endTime = typeof req.body?.end_time === 'string' ? req.body.end_time.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';

  if (title.length < 2) {
    res.status(400).json({ error: 'Appointment title must be at least 2 characters.' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
    return;
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    res.status(400).json({ error: 'Start and end times must be in HH:MM format.' });
    return;
  }
  if (endTime <= startTime) {
    res.status(400).json({ error: 'End time must be later than start time.' });
    return;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      'INSERT INTO time_slots (title, slot_date, start_time, end_time, location, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(title, slotDate, startTime, endTime, location || 'Main Studio', req.user!.id, now);

  const created = db
    .prepare('SELECT id, title, slot_date, start_time, end_time, location, created_at FROM time_slots WHERE id = ?')
    .get(Number(result.lastInsertRowid));

  res.status(201).json({ slot: created });
});

// Admin: Delete a time slot
app.delete('/api/slots/:id', requireAdmin, (req, res) => {
  const slotId = Number(req.params.id);
  if (!Number.isInteger(slotId) || slotId <= 0) {
    res.status(400).json({ error: 'Invalid slot ID.' });
    return;
  }

  const slot = db.prepare('SELECT id FROM time_slots WHERE id = ?').get(slotId) as { id: number } | undefined;
  if (!slot) {
    res.status(404).json({ error: 'Time slot not found.' });
    return;
  }

  const activeBooking = db
    .prepare("SELECT id FROM bookings WHERE slot_id = ? AND status = 'confirmed'")
    .get(slotId) as { id: number } | undefined;

  if (activeBooking && req.query.force !== 'true') {
    res.status(409).json({
      error: 'This time slot currently has a confirmed booking. Confirm removal to cancel the booking and delete the slot.',
      hasActiveBooking: true,
    });
    return;
  }

  db.prepare('DELETE FROM time_slots WHERE id = ?').run(slotId);
  res.json({ ok: true });
});

// List bookings (users see own; admins see all)
app.get('/api/bookings', requireAuth, (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user!.role === 'admin';
  const query = `
    SELECT
      b.id,
      b.slot_id,
      b.user_id,
      b.notes,
      b.status,
      b.created_at,
      b.cancelled_at,
      ts.title AS slot_title,
      ts.slot_date,
      ts.start_time,
      ts.end_time,
      ts.location,
      u.name AS user_name,
      u.email AS user_email
    FROM bookings b
    INNER JOIN time_slots ts ON ts.id = b.slot_id
    INNER JOIN users u ON u.id = b.user_id
    ${isAdmin ? '' : 'WHERE b.user_id = ?'}
    ORDER BY
      CASE WHEN b.status = 'confirmed' THEN 0 ELSE 1 END ASC,
      ts.slot_date ASC,
      ts.start_time ASC,
      b.id DESC
  `;

  const bookings = isAdmin
    ? db.prepare(query).all()
    : db.prepare(query).all(req.user!.id);

  res.json({ bookings });
});

// Book an available time slot
app.post('/api/bookings', requireAuth, (req: AuthenticatedRequest, res) => {
  const slotId = Number(req.body?.slot_id);
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '';

  if (!Number.isInteger(slotId) || slotId <= 0) {
    res.status(400).json({ error: 'Valid slot_id is required.' });
    return;
  }

  const createBookingTx = db.transaction((targetSlotId: number, userId: number, bookingNotes: string) => {
    const slot = db
      .prepare('SELECT id, title, slot_date, start_time, end_time, location FROM time_slots WHERE id = ?')
      .get(targetSlotId) as
      | { id: number; title: string; slot_date: string; start_time: string; end_time: string; location: string }
      | undefined;

    if (!slot) {
      return { status: 404 as const, error: 'Time slot not found.' };
    }

    const existing = db
      .prepare("SELECT id FROM bookings WHERE slot_id = ? AND status = 'confirmed'")
      .get(targetSlotId) as { id: number } | undefined;

    if (existing) {
      return { status: 409 as const, error: 'This time slot is already booked.' };
    }

    const now = new Date().toISOString();
    const insert = db
      .prepare('INSERT INTO bookings (slot_id, user_id, notes, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(targetSlotId, userId, bookingNotes, 'confirmed', now);

    return {
      status: 201 as const,
      booking: {
        id: Number(insert.lastInsertRowid),
        slot_id: targetSlotId,
        user_id: userId,
        notes: bookingNotes,
        status: 'confirmed',
        created_at: now,
        cancelled_at: null,
        slot_title: slot.title,
        slot_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        location: slot.location,
      },
    };
  });

  try {
    const outcome = createBookingTx(slotId, req.user!.id, notes);
    if ('error' in outcome) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.status(201).json({ booking: outcome.booking });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'This time slot is already booked.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

// Cancel a booking (owner or admin)
app.patch('/api/bookings/:id/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: 'Invalid booking ID.' });
    return;
  }

  const booking = db
    .prepare('SELECT id, user_id, status FROM bookings WHERE id = ?')
    .get(bookingId) as { id: number; user_id: number; status: string } | undefined;

  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  if (req.user!.role !== 'admin' && booking.user_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only cancel your own bookings.' });
    return;
  }

  if (booking.status === 'cancelled') {
    res.status(400).json({ error: 'Booking is already cancelled.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(now, bookingId);
  res.json({ ok: true, cancelled_at: now });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence appointment server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
