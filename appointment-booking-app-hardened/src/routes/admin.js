'use strict';

const express = require('express');
const config = require('../config');
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const {
  HttpError,
  requireObject,
  requireId,
  requireInt,
  requireInstant,
} = require('../lib/validate');

const router = express.Router();

// Every route below is admin-only. The guard is applied to the whole router so
// a newly added endpoint cannot accidentally be left unprotected.
router.use(requireAdmin);

/** All slots, newest first, with live and cancelled booking counts. */
router.get('/slots', (req, res, next) => {
  try {
    const limit = req.query.limit ? requireInt(req.query.limit, 'limit', { min: 1, max: 500 }) : 200;
    const offset = req.query.offset ? requireInt(req.query.offset, 'offset', { min: 0, max: 100000 }) : 0;

    const rows = getDb()
      .prepare(
        `SELECT s.id, s.starts_at, s.ends_at, s.capacity, s.created_at,
                (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id AND b.status = 'booked') AS booked_count
           FROM slots s
          ORDER BY s.starts_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);

    res.json({
      slots: rows.map((r) => ({
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        capacity: r.capacity,
        booked: r.booked_count,
        remaining: Math.max(r.capacity - r.booked_count, 0),
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/slots', (req, res, next) => {
  try {
    const body = requireObject(req.body);
    const startsAt = requireInstant(body.startsAt, 'startsAt');

    let endsAt;
    if (body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== '') {
      endsAt = requireInstant(body.endsAt, 'endsAt');
    } else {
      const minutes = requireInt(body.durationMinutes ?? 30, 'durationMinutes', {
        min: 5,
        max: config.booking.maxSlotDurationMinutes,
      });
      endsAt = new Date(Date.parse(startsAt) + minutes * 60 * 1000).toISOString();
    }

    const capacity = requireInt(body.capacity ?? 1, 'capacity', {
      min: 1,
      max: config.booking.maxSlotCapacity,
    });

    const durationMs = Date.parse(endsAt) - Date.parse(startsAt);
    if (durationMs <= 0) throw new HttpError(400, 'The slot must end after it starts.', 'bad_window');
    if (durationMs > config.booking.maxSlotDurationMinutes * 60 * 1000) {
      throw new HttpError(400, 'That slot is too long.', 'bad_window');
    }

    const db = getDb();
    const overlap = db
      .prepare('SELECT id FROM slots WHERE starts_at < ? AND ends_at > ? LIMIT 1')
      .get(endsAt, startsAt);
    if (overlap) {
      throw new HttpError(409, 'That time overlaps an existing slot.', 'slot_overlap');
    }

    let info;
    try {
      info = db
        .prepare('INSERT INTO slots (starts_at, ends_at, capacity) VALUES (?, ?, ?)')
        .run(startsAt, endsAt, capacity);
    } catch (e) {
      if (e && String(e.code).startsWith('SQLITE_CONSTRAINT')) {
        throw new HttpError(409, 'That slot already exists.', 'slot_duplicate');
      }
      throw e;
    }

    res.status(201).json({
      slot: {
        id: Number(info.lastInsertRowid),
        startsAt,
        endsAt,
        capacity,
        booked: 0,
        remaining: capacity,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove a slot. A slot that still has live bookings is refused unless the
 * caller passes ?force=true, so cancelling other people's appointments is
 * always a deliberate act rather than a side effect.
 */
router.delete('/slots/:id', (req, res, next) => {
  try {
    const id = requireId(req.params.id, 'id');
    const force = req.query.force === 'true';
    const db = getDb();

    const removeSlot = db.transaction(() => {
      const slot = db.prepare('SELECT id FROM slots WHERE id = ?').get(id);
      if (!slot) throw new HttpError(404, 'Slot not found.', 'not_found');

      const { n } = db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ? AND status = 'booked'")
        .get(id);
      if (n > 0 && !force) {
        throw new HttpError(
          409,
          `That slot has ${n} active booking(s). Re-send with force=true to cancel them.`,
          'slot_has_bookings',
        );
      }

      db.prepare(
        `UPDATE bookings
            SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE slot_id = ? AND status = 'booked'`,
      ).run(id);
      db.prepare('DELETE FROM slots WHERE id = ?').run(id);
      return n;
    });

    res.json({ ok: true, cancelledBookings: removeSlot.immediate() });
  } catch (err) {
    next(err);
  }
});

/** Every booking in the system, with the booking user's email. */
router.get('/bookings', (req, res, next) => {
  try {
    const limit = req.query.limit ? requireInt(req.query.limit, 'limit', { min: 1, max: 500 }) : 200;
    const offset = req.query.offset ? requireInt(req.query.offset, 'offset', { min: 0, max: 100000 }) : 0;
    const includeCancelled = req.query.includeCancelled === 'true';
    const from = req.query.from ? requireInstant(req.query.from, 'from') : null;

    const rows = getDb()
      .prepare(
        `SELECT b.id, b.slot_id, b.status, b.created_at, b.cancelled_at,
                s.starts_at, s.ends_at,
                u.id AS user_id, u.email
           FROM bookings b
           JOIN slots s ON s.id = b.slot_id
           JOIN users u ON u.id = b.user_id
          WHERE (? = 1 OR b.status = 'booked')
            AND (? IS NULL OR s.starts_at >= ?)
          ORDER BY s.starts_at DESC, b.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(includeCancelled ? 1 : 0, from, from, limit, offset);

    res.json({
      bookings: rows.map((r) => ({
        id: r.id,
        slotId: r.slot_id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.status,
        createdAt: r.created_at,
        cancelledAt: r.cancelled_at,
        user: { id: r.user_id, email: r.email },
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
