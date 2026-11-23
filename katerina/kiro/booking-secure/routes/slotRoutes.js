'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/slots — all available slots (authenticated users)
router.get('/', requireAuth, (req, res) => {
  const slots = db
    .prepare('SELECT id, start_time, duration FROM slots WHERE available = 1 ORDER BY start_time')
    .all();
  res.json(slots);
});

// GET /api/slots/all — all slots regardless of availability (admin only)
router.get('/all', requireAuth, requireAdmin, (req, res) => {
  const slots = db
    .prepare('SELECT * FROM slots ORDER BY start_time')
    .all();
  res.json(slots);
});

// POST /api/slots — add a new slot (admin only)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { start_time, duration } = req.body;

  if (typeof start_time !== 'string' || !start_time.trim()) {
    return res.status(400).json({ error: 'start_time is required.' });
  }

  // Validate ISO 8601 datetime (YYYY-MM-DDTHH:MM or YYYY-MM-DD HH:MM)
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(start_time.trim())) {
    return res.status(400).json({
      error: 'start_time must be a valid datetime string (e.g. 2024-06-01T09:00).',
    });
  }

  const dur = Number.isInteger(duration) ? duration : 30;
  if (dur < 5 || dur > 480) {
    return res.status(400).json({ error: 'duration must be between 5 and 480 minutes.' });
  }

  try {
    const result = db
      .prepare('INSERT INTO slots (start_time, duration, available) VALUES (?, ?, 1)')
      .run(start_time.trim(), dur);
    res.status(201).json({ id: result.lastInsertRowid, start_time: start_time.trim(), duration: dur });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A slot at that time already exists.' });
    }
    throw err;
  }
});

// DELETE /api/slots/:id — remove a slot (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid slot ID.' });
  }

  const slot = db.prepare('SELECT id FROM slots WHERE id = ?').get(id);
  if (!slot) {
    return res.status(404).json({ error: 'Slot not found.' });
  }

  db.prepare('DELETE FROM slots WHERE id = ?').run(id);
  res.json({ message: 'Slot removed.' });
});

module.exports = router;
