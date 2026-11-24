'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/bookings — user sees their own; admin sees all
router.get('/', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    const rows = db
      .prepare(`
        SELECT b.id, b.created_at,
               s.start_time, s.duration,
               u.username
        FROM   bookings b
        JOIN   slots    s ON s.id = b.slot_id
        JOIN   users    u ON u.id = b.user_id
        ORDER BY s.start_time
      `)
      .all();
    return res.json(rows);
  }

  const rows = db
    .prepare(`
      SELECT b.id, b.created_at,
             s.start_time, s.duration
      FROM   bookings b
      JOIN   slots    s ON s.id = b.slot_id
      WHERE  b.user_id = ?
      ORDER BY s.start_time
    `)
    .all(req.user.id);
  res.json(rows);
});

// POST /api/bookings — book a slot
router.post('/', requireAuth, (req, res) => {
  const slotId = parseInt(req.body.slot_id, 10);
  if (!Number.isFinite(slotId) || slotId < 1) {
    return res.status(400).json({ error: 'Invalid slot_id.' });
  }

  // Use a transaction so the availability check and insert are atomic
  const book = db.transaction(() => {
    const slot = db
      .prepare('SELECT id, available FROM slots WHERE id = ?')
      .get(slotId);

    if (!slot) return { status: 404, error: 'Slot not found.' };
    if (!slot.available) return { status: 409, error: 'Slot is no longer available.' };

    // Check user has not already booked this slot (belt-and-suspenders; UNIQUE handles it too)
    const existing = db
      .prepare('SELECT id FROM bookings WHERE user_id = ? AND slot_id = ?')
      .get(req.user.id, slotId);
    if (existing) return { status: 409, error: 'You have already booked this slot.' };

    db.prepare('UPDATE slots SET available = 0 WHERE id = ?').run(slotId);
    const result = db
      .prepare('INSERT INTO bookings (user_id, slot_id) VALUES (?, ?)')
      .run(req.user.id, slotId);

    return { status: 201, id: result.lastInsertRowid };
  });

  const outcome = book();
  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.status(201).json({ message: 'Booking confirmed.', booking_id: outcome.id });
});

// DELETE /api/bookings/:id — cancel a booking
// Users can only cancel their own; admins can cancel any.
router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid booking ID.' });
  }

  const cancel = db.transaction(() => {
    const booking = db
      .prepare('SELECT id, user_id, slot_id FROM bookings WHERE id = ?')
      .get(id);

    if (!booking) return { status: 404, error: 'Booking not found.' };

    // Non-admins can only cancel their own bookings
    if (req.user.role !== 'admin' && booking.user_id !== req.user.id) {
      return { status: 403, error: 'You can only cancel your own bookings.' };
    }

    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    db.prepare('UPDATE slots SET available = 1 WHERE id = ?').run(booking.slot_id);
    return { status: 200 };
  });

  const outcome = cancel();
  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  res.json({ message: 'Booking cancelled.' });
});

module.exports = router;
