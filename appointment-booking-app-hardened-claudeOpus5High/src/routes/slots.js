'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireInt, requireInstant } = require('../lib/validate');

const router = express.Router();

/**
 * Upcoming slots with their remaining capacity.
 *
 * Signed-in users only: the schedule is business data, and keeping it behind
 * authentication avoids handing out a free view of appointment availability.
 * Only aggregate counts are returned here - never who booked what.
 */
router.get('/', requireAuth, (req, res, next) => {
  try {
    const from = req.query.from ? requireInstant(req.query.from, 'from') : new Date().toISOString();
    const to = req.query.to ? requireInstant(req.query.to, 'to') : null;
    const limit = req.query.limit ? requireInt(req.query.limit, 'limit', { min: 1, max: 200 }) : 100;

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT s.id,
                s.starts_at,
                s.ends_at,
                s.capacity,
                (SELECT COUNT(*) FROM bookings b
                  WHERE b.slot_id = s.id AND b.status = 'booked') AS booked_count,
                EXISTS (SELECT 1 FROM bookings b
                         WHERE b.slot_id = s.id AND b.status = 'booked' AND b.user_id = ?) AS mine
           FROM slots s
          WHERE s.starts_at >= ?
            AND (? IS NULL OR s.starts_at <= ?)
          ORDER BY s.starts_at ASC
          LIMIT ?`,
      )
      .all(req.user.id, from, to, to, limit);

    res.json({
      slots: rows.map((r) => ({
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        capacity: r.capacity,
        booked: r.booked_count,
        remaining: Math.max(r.capacity - r.booked_count, 0),
        bookedByMe: Boolean(r.mine),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
