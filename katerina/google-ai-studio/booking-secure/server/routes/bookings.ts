import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { requireAuth } from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';

const router = Router();

router.use(requireAuth);

const createBookingSchema = z.object({
  slotId: z.number().int().positive(),
  notes: z.string().trim().max(500, 'Notes must be 500 characters or fewer.').optional().default(''),
});

router.get('/mine', (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;

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
         ts.title AS slotTitle,
         ts.description AS slotDescription,
         ts.start_time AS startTime,
         ts.end_time AS endTime
       FROM bookings b
       JOIN time_slots ts ON ts.id = b.slot_id
       WHERE b.user_id = ?
       ORDER BY ts.start_time DESC`
    )
    .all(userId);

  res.json({ bookings });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid booking request.' });
    return;
  }

  const { slotId, notes } = parsed.data;
  const userId = req.authUser!.id;

  const bookSlotTx = db.transaction(() => {
    const slot = db
      .prepare('SELECT id, title, description, start_time, end_time FROM time_slots WHERE id = ?')
      .get(slotId) as
      | {
          id: number;
          title: string;
          description: string;
          start_time: string;
          end_time: string;
        }
      | undefined;

    if (!slot) {
      return { status: 404 as const, error: 'Time slot not found.' };
    }

    if (Date.parse(slot.start_time) <= Date.now()) {
      return { status: 400 as const, error: 'Cannot book a time slot that has already started or passed.' };
    }

    const activeBooking = db
      .prepare("SELECT id FROM bookings WHERE slot_id = ? AND status = 'confirmed'")
      .get(slotId) as { id: number } | undefined;

    if (activeBooking) {
      return { status: 409 as const, error: 'This time slot has already been booked.' };
    }

    const overlapping = db
      .prepare(
        `SELECT b.id
         FROM bookings b
         JOIN time_slots ts ON ts.id = b.slot_id
         WHERE b.user_id = ?
           AND b.status = 'confirmed'
           AND ts.start_time < ?
           AND ts.end_time > ?
         LIMIT 1`
      )
      .get(userId, slot.end_time, slot.start_time) as { id: number } | undefined;

    if (overlapping) {
      return {
        status: 409 as const,
        error: 'You already have another confirmed booking that overlaps this time slot.',
      };
    }

    const insert = db
      .prepare("INSERT INTO bookings (slot_id, user_id, notes, status) VALUES (?, ?, ?, 'confirmed')")
      .run(slotId, userId, notes);

    const booking = db
      .prepare(
        `SELECT
           b.id,
           b.slot_id AS slotId,
           b.user_id AS userId,
           b.notes,
           b.status,
           b.created_at AS createdAt,
           b.cancelled_at AS cancelledAt,
           ts.title AS slotTitle,
           ts.description AS slotDescription,
           ts.start_time AS startTime,
           ts.end_time AS endTime
         FROM bookings b
         JOIN time_slots ts ON ts.id = b.slot_id
         WHERE b.id = ?`
      )
      .get(Number(insert.lastInsertRowid));

    return { status: 201 as const, booking };
  }).immediate;

  const outcome = bookSlotTx();
  if ('error' in outcome) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  res.status(201).json({ booking: outcome.booking });
});

router.post('/:id/cancel', (req: AuthenticatedRequest, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: 'Invalid booking ID.' });
    return;
  }

  const userId = req.authUser!.id;

  const cancelTx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT b.id, b.user_id, b.status, ts.start_time
         FROM bookings b
         JOIN time_slots ts ON ts.id = b.slot_id
         WHERE b.id = ?`
      )
      .get(bookingId) as
      | { id: number; user_id: number; status: 'confirmed' | 'cancelled'; start_time: string }
      | undefined;

    if (!row) {
      return { status: 404 as const, error: 'Booking not found.' };
    }

    if (row.user_id !== userId) {
      return { status: 403 as const, error: 'You can only cancel your own bookings.' };
    }

    if (row.status === 'cancelled') {
      return { status: 400 as const, error: 'This booking is already cancelled.' };
    }

    if (Date.parse(row.start_time) <= Date.now()) {
      return { status: 400 as const, error: 'Cannot cancel an appointment that has already started.' };
    }

    db.prepare(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
    ).run(bookingId);

    const updated = db
      .prepare(
        `SELECT
           b.id,
           b.slot_id AS slotId,
           b.user_id AS userId,
           b.notes,
           b.status,
           b.created_at AS createdAt,
           b.cancelled_at AS cancelledAt,
           ts.title AS slotTitle,
           ts.description AS slotDescription,
           ts.start_time AS startTime,
           ts.end_time AS endTime
         FROM bookings b
         JOIN time_slots ts ON ts.id = b.slot_id
         WHERE b.id = ?`
      )
      .get(bookingId);

    return { status: 200 as const, booking: updated };
  }).immediate;

  const outcome = cancelTx();
  if ('error' in outcome) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  res.json({ booking: outcome.booking });
});

export default router;
