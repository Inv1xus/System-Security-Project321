import { Router } from 'express';
import { requireUser } from '../auth.js';

export function bookingRoutes(db) {
  const router = Router();
  router.use(requireUser);

  // The signed-in user's own bookings, soonest first.
  router.get('/', (req, res) => {
    const bookings = db.prepare(`
      SELECT b.id, b.created_at AS bookedAt, s.id AS slotId,
             s.starts_at AS startsAt, s.ends_at AS endsAt
      FROM bookings b JOIN slots s ON s.id = b.slot_id
      WHERE b.user_id = ?
      ORDER BY s.starts_at
    `).all(req.user.id);

    res.json({ bookings });
  });

  // Book one free slot.
  router.post('/', (req, res) => {
    const slotId = Number(req.body?.slotId);
    if (!Number.isInteger(slotId) || slotId <= 0) {
      return res.status(400).json({ error: 'Pick a time slot.' });
    }

    const slot = db.prepare('SELECT id, starts_at AS startsAt FROM slots WHERE id = ?').get(slotId);
    if (!slot) return res.status(404).json({ error: 'That time slot no longer exists.' });
    if (slot.startsAt <= new Date().toISOString()) {
      return res.status(409).json({ error: 'That time slot is in the past.' });
    }

    try {
      // slot_id is UNIQUE, so two people racing for the same slot cannot both win.
      const info = db.prepare(
        'INSERT INTO bookings (slot_id, user_id, created_at) VALUES (?, ?, ?)'
      ).run(slotId, req.user.id, new Date().toISOString());

      res.status(201).json({ booking: { id: Number(info.lastInsertRowid), slotId } });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'That time slot has just been taken.' });
      }
      throw err;
    }
  });

  // Cancel a booking. The user_id check keeps users out of each other's bookings.
  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Unknown booking.' });
    }

    const info = db.prepare('DELETE FROM bookings WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Booking not found.' });

    res.json({ ok: true });
  });

  return router;
}
