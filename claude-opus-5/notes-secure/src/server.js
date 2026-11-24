import { createApp } from './app.js';
import { config } from './config.js';
import { closeDatabase } from './db.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[server] private-notes listening on http://${config.host}:${config.port} (${config.nodeEnv})`
  );
});

// Slowloris mitigation: cap how long headers and idle connections may linger.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 10_000;

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);

  server.close(() => {
    app.locals.sessionStore?.stop();
    closeDatabase();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection', reason);
  shutdown('unhandledRejection');
});
