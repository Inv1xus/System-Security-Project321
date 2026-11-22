'use strict';

const express = require('express');
const config = require('../config');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { HttpError, requireObject, requireId } = require('../lib/validate');

const router = express.Router();

router.use(requireAuth);

function shape(row) {
  return {
    id: row.id,
    slotId: row.slot_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

/** The signed-in user's own bookings - scoped by user_id in SQL, not by filtering later. */
router.get('/', (req, res, next) => {
  try {
    const includeCancelled = req.query.includeCancelled === 'true';
    const rows = getDb()
      .prepare(
        `SELECT b.id, b.slot_id, b.status, b.created_at, b.cancelled_at, s.starts_at, s.ends_at
           FROM bookings b
           JOIN slots s ON s.id = b.slot_id
          WHERE b.user_id = ?
            AND (? = 1 OR b.status = 'booked')
          ORDER BY s.starts_at ASC
          LIMIT 500`,
      )
      .all(req.user.id, includeCancelled ? 1 : 0);
    res.json({ bookings: rows.map(shape) });
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const body = requireObject(req.body);
    const slotId = requireId(body.slotId, 'slotId');
    const db = getDb();
    const userId = req.user.id;

    // One IMMEDIATE transaction: the capacity check and the insert cannot be
    // interleaved with another booking, so a slot can never be oversold.
    const book = db.transaction(() => {
      const slot = db.prepare('SELECT id, starts_at, capacity FROM slots WHERE id = ?').get(slotId);
      if (!slot) throw new HttpError(404, 'That time slot no longer exists.', 'slot_missing');
      if (Date.parse(slot.starts_at) <= Date.now()) {
        throw new HttpError(409, 'That time slot is in the past.', 'slot_past');
      }

      const existing = db
        .prepare("SELECT id FROM bookings WHERE slot_id = ? AND user_id = ? AND status = 'booked'")
        .get(slotId, userId);
      if (existing) throw new HttpError(409, 'You have already booked that slot.', 'already_booked');

      const { n } = db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ? AND status = 'booked'")
        .get(slotId);
      if (n >= slot.capacity) throw new HttpError(409, 'That time slot is full.', 'slot_full');

      const { active } = db
        .prepare("SELECT COUNT(*) AS active FROM bookings WHERE user_id = ? AND status = 'booked'")
        .get(userId);
      if (active >= config.booking.maxActivePerUser) {
        throw new HttpError(
          409,
          `You can hold at most ${config.booking.maxActivePerUser} active bookings.`,
          'booking_limit',
        );
      }

      const info = db
        .prepare("INSERT INTO bookings (slot_id, user_id, status) VALUES (?, ?, 'booked')")
        .run(slotId, userId);
      return Number(info.lastInsertRowid);
    });

    let id;
    try {
      id = book.immediate();
    } catch (e) {
      if (e && String(e.code).startsWith('SQLITE_CONSTRAINT')) {
        throw new HttpError(409, 'You have already booked that slot.', 'already_booked');
      }
      throw e;
    }

    const row = getDb()
      .prepare(
        `SELECT b.id, b.slot_id, b.status, b.created_at, b.cancelled_at, s.starts_at, s.ends_at
           FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.id = ?`,
      )
      .get(id);
    res.status(201).json({ booking: shape(row) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = requireId(req.params.id, 'id');
    const db = getDb();

    const row = db
      .prepare(
        `SELECT b.id, b.user_id, b.status, s.starts_at
           FROM bookings b JOIN slots s ON s.id = b.slot_id
          WHERE b.id = ?`,
      )
      .get(id);

    // A booking owned by somebody else is reported as "not found" so that the
    // endpoint cannot be used to probe which booking ids exist.
    if (!row || row.user_id !== req.user.id) {
      throw new HttpError(404, 'Booking not found.', 'not_found');
    }
    if (row.status !== 'booked') {
      throw new HttpError(409, 'That booking is already cancelled.', 'already_cancelled');
    }
    if (Date.parse(row.starts_at) <= Date.now()) {
      throw new HttpError(409, 'Past appointments cannot be cancelled.', 'slot_past');
    }

    db.prepare(
      `UPDATE bookings
          SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND user_id = ? AND status = 'booked'`,
    ).run(id, req.user.id);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
