import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const app = createApp({
  databasePath: process.env.DATABASE_PATH || './data/notes.sqlite',
  cookieSecure: process.env.COOKIE_SECURE === 'true'
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Private Notes is listening on port ${port}`);
});
