import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

router.get('/', (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const dateFilter = typeof req.query.date === 'string' ? req.query.date.trim() : '';

  const nowIso = new Date().toISOString();

  let sql = `
    SELECT
      ts.id,
      ts.title,
      ts.description,
      ts.start_time AS startTime,
      ts.end_time AS endTime,
      ts.created_at AS createdAt
    FROM time_slots ts
    LEFT JOIN bookings b
      ON b.slot_id = ts.id AND b.status = 'confirmed'
    WHERE b.id IS NULL
      AND ts.start_time > ?
  `;

  const params: string[] = [nowIso];

  if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    sql += ' AND substr(ts.start_time, 1, 10) = ?';
    params.push(dateFilter);
  }

  if (search) {
    sql += ' AND (lower(ts.title) LIKE ? OR lower(ts.description) LIKE ?)';
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  sql += ' ORDER BY ts.start_time ASC';

  const slots = db.prepare(sql).all(...params);
  res.json({ slots });
});

export default router;
