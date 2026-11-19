import { Router } from 'express';
import { requireAdmin } from '../auth.js';

function toIsoMinute(value) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return null;
  date.setSeconds(0, 0);
  return date.toISOString();
}

export function adminRoutes(db) {
  const router = Router();
  router.use(requireAdmin);

  // Every booking in the system, with who made it.
  router.get('/bookings', (_req, res) => {
    const bookings = db.prepare(`
      SELECT b.id, b.created_at AS bookedAt, u.email AS userEmail,
             s.id AS slotId, s.starts_at AS startsAt, s.ends_at AS endsAt
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      JOIN slots s ON s.id = b.slot_id
      ORDER BY s.starts_at
    `).all();

    res.json({ bookings });
  });

  // Every slot, free or taken.
  router.get('/slots', (_req, res) => {
    const slots = db.prepare(`
      SELECT s.id, s.starts_at AS startsAt, s.ends_at AS endsAt, u.email AS bookedBy
      FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id
      LEFT JOIN users u ON u.id = b.user_id
      ORDER BY s.starts_at
    `).all();

    res.json({ slots });
  });

  // Add a slot.
  router.post('/slots', (req, res) => {
    const startsAt = toIsoMinute(req.body?.startsAt);
    const endsAt = toIsoMinute(req.body?.endsAt);

    if (!startsAt || !endsAt) {
      return res.status(400).json({ error: 'Give a valid start and end time.' });
    }
    if (endsAt <= startsAt) {
      return res.status(400).json({ error: 'The end time must come after the start time.' });
    }

    const clash = db.prepare(
      'SELECT id FROM slots WHERE starts_at < ? AND ends_at > ? LIMIT 1'
    ).get(endsAt, startsAt);
    if (clash) return res.status(409).json({ error: 'That overlaps an existing time slot.' });

    const info = db.prepare(
      'INSERT INTO slots (starts_at, ends_at, created_at) VALUES (?, ?, ?)'
    ).run(startsAt, endsAt, new Date().toISOString());

    res.status(201).json({ slot: { id: Number(info.lastInsertRowid), startsAt, endsAt } });
  });

  // Remove a slot. Any booking on it is removed too (ON DELETE CASCADE).
  router.delete('/slots/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Unknown time slot.' });
    }

    const info = db.prepare('DELETE FROM slots WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Time slot not found.' });

    res.json({ ok: true });
  });

  return router;
}
