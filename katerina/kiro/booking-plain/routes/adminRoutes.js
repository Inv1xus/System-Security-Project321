const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

// GET /api/admin/bookings  — all bookings
router.get('/bookings', requireAdmin, (req, res) => {
  const bookings = db.prepare(`
    SELECT
      b.id        AS booking_id,
      u.username,
      u.email,
      s.date,
      s.start_time,
      s.end_time,
      b.created_at
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN slots  s ON s.id = b.slot_id
    ORDER BY s.date, s.start_time, u.username
  `).all();
  res.json(bookings);
});

// GET /api/admin/slots  — all slots (same as user view but no user filter)
router.get('/slots', requireAdmin, (req, res) => {
  const slots = db.prepare(`
    SELECT
      s.id,
      s.date,
      s.start_time,
      s.end_time,
      s.capacity,
      COUNT(b.id)              AS booked,
      s.capacity - COUNT(b.id) AS available
    FROM slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    GROUP BY s.id
    ORDER BY s.date, s.start_time
  `).all();
  res.json(slots);
});

// POST /api/admin/slots  — add a slot
router.post('/slots', requireAdmin, (req, res) => {
  const { date, start_time, end_time, capacity } = req.body;

  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: 'date, start_time, and end_time are required' });
  }

  const cap = parseInt(capacity) || 1;
  if (cap < 1) return res.status(400).json({ error: 'capacity must be at least 1' });

  try {
    const result = db.prepare(
      "INSERT INTO slots (date, start_time, end_time, capacity) VALUES (?, ?, ?, ?)"
    ).run(date, start_time, end_time, cap);
    res.json({ ok: true, slotId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A slot with that date and time already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/slots/:id  — remove a slot and its bookings
router.delete('/slots/:id', requireAdmin, (req, res) => {
  const slotId = req.params.id;
  // Remove dependent bookings first
  db.prepare("DELETE FROM bookings WHERE slot_id = ?").run(slotId);
  const result = db.prepare("DELETE FROM slots WHERE id = ?").run(slotId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Slot not found' });
  }
  res.json({ ok: true });
});

// DELETE /api/admin/bookings/:id  — cancel any booking
router.delete('/bookings/:id', requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM bookings WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  res.json({ ok: true });
});

module.exports = router;
