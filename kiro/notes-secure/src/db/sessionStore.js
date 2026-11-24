'use strict';

/**
 * A minimal express-session store backed by the same node:sqlite database.
 * Implements the full Store interface: get, set, destroy, touch, clear, length, all.
 */

const { Store } = require('express-session');

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // prune expired sessions every 10 min

class SQLiteSessionStore extends Store {
  /**
   * @param {import('node:sqlite').DatabaseSync} db - Shared DatabaseSync instance
   */
  constructor(db) {
    super();

    this.db = db;

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid        TEXT    PRIMARY KEY,
        sess       TEXT    NOT NULL,
        expired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired_at ON sessions(expired_at);
    `);

    // Periodically remove expired sessions
    this._timer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS).unref();
  }

  _cleanup() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expired_at <= ?').run(Date.now());
    } catch (e) {
      // Non-fatal; log and continue
      console.error('Session cleanup error:', e);
    }
  }

  /** express-session: retrieve session by sid */
  get(sid, cb) {
    try {
      const row = this.db
        .prepare('SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?')
        .get(sid, Date.now());
      if (!row) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) {
      cb(e);
    }
  }

  /** express-session: save / update session */
  set(sid, session, cb) {
    try {
      const maxAge = session.cookie?.maxAge ?? 86400000;
      const expiredAt = Date.now() + maxAge;
      this.db
        .prepare(
          `INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at`
        )
        .run(sid, JSON.stringify(session), expiredAt);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  /** express-session: delete session by sid */
  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  /** express-session: refresh session expiry without changing session data */
  touch(sid, session, cb) {
    try {
      const maxAge = session.cookie?.maxAge ?? 86400000;
      const expiredAt = Date.now() + maxAge;
      this.db
        .prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?')
        .run(expiredAt, sid);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  /** express-session: return count of sessions */
  length(cb) {
    try {
      const row = this.db
        .prepare('SELECT COUNT(*) AS count FROM sessions WHERE expired_at > ?')
        .get(Date.now());
      cb(null, row.count);
    } catch (e) {
      cb(e);
    }
  }

  /** express-session: return all sessions */
  all(cb) {
    try {
      const rows = this.db
        .prepare('SELECT sid, sess FROM sessions WHERE expired_at > ?')
        .all(Date.now());
      const sessions = {};
      for (const row of rows) {
        sessions[row.sid] = JSON.parse(row.sess);
      }
      cb(null, sessions);
    } catch (e) {
      cb(e);
    }
  }

  /** express-session: delete all sessions */
  clear(cb) {
    try {
      this.db.prepare('DELETE FROM sessions').run();
      cb(null);
    } catch (e) {
      cb(e);
    }
  }
}

module.exports = SQLiteSessionStore;
