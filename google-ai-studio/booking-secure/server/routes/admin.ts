import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { requireAdmin, requireAuth } from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';

const router = Router();

router.use(requireAuth, requireAdmin);

const createSlotSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(120),
  description: z.string().trim().max(400).optional().default(''),
  startTime: z.string().min(1, 'Start time is required.'),
  endTime: z.string().min(1, 'End time is required.'),
});

router.get('/bookings', (_req, res) => {
  const bookings = db
    .prepare(
      `SELECT
         b.id,
         b.slot_id AS slotId,
         b.user_id AS userId,
         b.notes,
         b.status,
         b.created_at AS createdAt,
         b.cancelled_at AS cancelledAt,
         u.name AS userName,
         u.email AS userEmail,
         ts.title AS slotTitle,
         ts.description AS slotDescription,
         ts.start_time AS startTime,
         ts.end_time AS endTime
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN time_slots ts ON ts.id = b.slot_id
       ORDER BY ts.start_time DESC, b.id DESC`
    )
    .all();

  res.json({ bookings });
});

router.post('/bookings/:id/cancel', (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: 'Invalid booking ID.' });
    return;
  }

  const row = db
    .prepare('SELECT id, status FROM bookings WHERE id = ?')
    .get(bookingId) as { id: number; status: 'confirmed' | 'cancelled' } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  if (row.status === 'cancelled') {
    res.status(400).json({ error: 'Booking is already cancelled.' });
    return;
  }

  db.prepare(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ).run(bookingId);

  res.json({ ok: true });
});

router.get('/slots', (_req, res) => {
  const slots = db
    .prepare(
      `SELECT
         ts.id,
         ts.title,
         ts.description,
         ts.start_time AS startTime,
         ts.end_time AS endTime,
         ts.created_at AS createdAt,
         b.id AS activeBookingId,
         b.notes AS activeBookingNotes,
         u.name AS bookedByName,
         u.email AS bookedByEmail
       FROM time_slots ts
       LEFT JOIN bookings b ON b.slot_id = ts.id AND b.status = 'confirmed'
       LEFT JOIN users u ON u.id = b.user_id
       ORDER BY ts.start_time ASC`
    )
    .all();

  res.json({ slots });
});

router.post('/slots', (req: AuthenticatedRequest, res) => {
  const parsed = createSlotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid time slot data.' });
    return;
  }

  const startMs = Date.parse(parsed.data.startTime);
  const endMs = Date.parse(parsed.data.endTime);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    res.status(400).json({ error: 'Invalid date or time format.' });
    return;
  }

  if (endMs <= startMs) {
    res.status(400).json({ error: 'End time must be after start time.' });
    return;
  }

  const durationMinutes = (endMs - startMs) / 60_000;
  if (durationMinutes < 5 || durationMinutes > 12 * 60) {
    res.status(400).json({ error: 'Slot duration must be between 5 minutes and 12 hours.' });
    return;
  }

  if (startMs < Date.now() - 60_000) {
    res.status(400).json({ error: 'Cannot create a time slot in the past.' });
    return;
  }

  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  const insert = db
    .prepare(
      'INSERT INTO time_slots (title, description, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?)'
    )
    .run(parsed.data.title, parsed.data.description, startIso, endIso, req.authUser!.id);

  const slot = db
    .prepare(
      `SELECT
         id,
         title,
         description,
         start_time AS startTime,
         end_time AS endTime,
         created_at AS createdAt
       FROM time_slots
       WHERE id = ?`
    )
    .get(Number(insert.lastInsertRowid));

  res.status(201).json({ slot });
});

router.delete('/slots/:id', (req, res) => {
  const slotId = Number(req.params.id);
  if (!Number.isInteger(slotId) || slotId <= 0) {
    res.status(400).json({ error: 'Invalid time slot ID.' });
    return;
  }

  const force = req.query.force === 'true';

  const removeTx = db.transaction(() => {
    const slot = db.prepare('SELECT id FROM time_slots WHERE id = ?').get(slotId) as
      | { id: number }
      | undefined;
    if (!slot) {
      return { status: 404 as const, error: 'Time slot not found.' };
    }

    const activeBooking = db
      .prepare("SELECT id FROM bookings WHERE slot_id = ? AND status = 'confirmed'")
      .get(slotId) as { id: number } | undefined;

    if (activeBooking && !force) {
      return {
        status: 409 as const,
        error: 'This slot has an active confirmed booking. Confirm force removal to proceed.',
        hasActiveBooking: true,
      };
    }

    db.prepare('DELETE FROM time_slots WHERE id = ?').run(slotId);
    return { status: 200 as const, ok: true };
  }).immediate;

  const outcome = removeTx();
  if ('error' in outcome) {
    res.status(outcome.status).json({
      error: outcome.error,
      hasActiveBooking: 'hasActiveBooking' in outcome ? outcome.hasActiveBooking : false,
    });
    return;
  }

  res.json({ ok: true });
});

export default router;
