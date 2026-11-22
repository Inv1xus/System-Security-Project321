import session from 'express-session';
import { db } from '../db.js';

/**
 * Server-side session store backed by the same SQLite file as the app data.
 * Session contents never leave the server; the cookie only carries a signed,
 * random session id.
 */
export class SqliteSessionStore extends session.Store {
  constructor({ ttlMs }) {
    super();
    this.ttlMs = ttlMs;

    this.stmt = {
      get: db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?'),
      set: db.prepare(
        `INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET expires_at = excluded.expires_at, data = excluded.data`
      ),
      touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?'),
      destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      prune: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    };

    this.pruneTimer = setInterval(() => this.prune(), 10 * 60 * 1000);
    this.pruneTimer.unref?.();
    this.prune();
  }

  #expiry(sess) {
    const cookieExpires = sess?.cookie?.expires;
    const ts = cookieExpires ? new Date(cookieExpires).getTime() : Date.now() + this.ttlMs;
    return Number.isFinite(ts) ? ts : Date.now() + this.ttlMs;
  }

  get(sid, callback) {
    try {
      const row = this.stmt.get.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.stmt.destroy.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      this.stmt.set.run(sid, this.#expiry(sess), JSON.stringify(sess));
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      this.stmt.touch.run(this.#expiry(sess), sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.stmt.destroy.run(sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  prune() {
    try {
      this.stmt.prune.run(Date.now());
    } catch {
      /* non-fatal background cleanup */
    }
  }

  stop() {
    clearInterval(this.pruneTimer);
  }
}
