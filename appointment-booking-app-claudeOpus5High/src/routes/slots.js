import { Router } from 'express';
import { requireUser } from '../auth.js';

/** Time slots that are still in the future and not booked by anyone. */
export function slotRoutes(db) {
  const router = Router();

  router.get('/', requireUser, (_req, res) => {
    const slots = db.prepare(`
      SELECT s.id, s.starts_at AS startsAt, s.ends_at AS endsAt
      FROM slots s
      WHERE s.starts_at > ?
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
      ORDER BY s.starts_at
    `).all(new Date().toISOString());

    res.json({ slots });
  });

  return router;
}
