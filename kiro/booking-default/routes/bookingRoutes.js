const express = require('express');
const db = require('../db');
const { requireLogin } = require('../auth');

const router = express.Router();

// GET /api/slots  — list all slots with availability
router.get('/slots', requireLogin, (req, res) => {
  const slots = db.prepare(`
    SELECT
      s.id,
      s.date,
      s.start_time,
      s.end_time,
      s.capacity,
      COUNT(b.id)                         AS booked,
      s.capacity - COUNT(b.id)            AS available,
      MAX(CASE WHEN b.user_id = ? THEN 1 ELSE 0 END) AS my_booking
    FROM slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    GROUP BY s.id
    ORDER BY s.date, s.start_time
  `).all(req.session.userId);
  res.json(slots);
});

// POST /api/bookings  — book a slot
router.post('/bookings', requireLogin, (req, res) => {
  const { slot_id } = req.body;
  if (!slot_id) return res.status(400).json({ error: 'slot_id is required' });

  // Check the slot exists and has capacity
  const slot = db.prepare(`
    SELECT s.capacity, COUNT(b.id) AS booked
    FROM slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    WHERE s.id = ?
    GROUP BY s.id
  `).get(slot_id);

  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (slot.booked >= slot.capacity) return res.status(409).json({ error: 'Slot is fully booked' });

  try {
    const result = db.prepare(
      "INSERT INTO bookings (user_id, slot_id) VALUES (?, ?)"
    ).run(req.session.userId, slot_id);
    res.json({ ok: true, bookingId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'You already booked this slot' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bookings  — user's own bookings
router.get('/bookings', requireLogin, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.id AS booking_id, s.date, s.start_time, s.end_time, b.created_at
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    WHERE b.user_id = ?
    ORDER BY s.date, s.start_time
  `).all(req.session.userId);
  res.json(bookings);
});

// DELETE /api/bookings/:id  — cancel own booking
router.delete('/bookings/:id', requireLogin, (req, res) => {
  const result = db.prepare(
    "DELETE FROM bookings WHERE id = ? AND user_id = ?"
  ).run(req.params.id, req.session.userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Booking not found or not yours' });
  }
  res.json({ ok: true });
});

module.exports = router;
