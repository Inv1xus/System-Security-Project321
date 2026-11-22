import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDatabase } from './db.js';
import { sessionLoader, ensureAdmin } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { slotRoutes } from './routes/slots.js';
import { bookingRoutes } from './routes/bookings.js';
import { adminRoutes } from './routes/admin.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const db = openDatabase(DATA_DIR);
ensureAdmin(db, ADMIN_EMAIL, ADMIN_PASSWORD);

// Drop expired sessions on boot and then every hour.
const purgeSessions = () => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
purgeSessions();
setInterval(purgeSessions, 60 * 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(sessionLoader(db));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes(db));
app.use('/api/slots', slotRoutes(db));
app.use('/api/bookings', bookingRoutes(db));
app.use('/api/admin', adminRoutes(db));

app.use(express.static(publicDir, { index: 'index.html' }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Anything unexpected becomes a plain 500 instead of leaking a stack trace.
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  res.status(500).json({ error: 'Something went wrong.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Appointment booking app listening on http://localhost:${PORT}`);
  console.log(`Database: ${join(DATA_DIR, 'appointments.db')}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
