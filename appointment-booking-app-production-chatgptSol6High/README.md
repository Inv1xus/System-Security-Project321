# Appointment Booking

A single-container appointment booking app built with Node.js 24, Express 5, and SQLite. Users can sign up, log in, browse available time slots, book a slot, and view or cancel their own bookings. An admin can view every booking and add or remove unbooked slots.

## Folder structure

```text
appointment-booking-app-production-chatgptSol6High/
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
├── dist/
│   ├── README.txt
│   ├── SHA256SUMS.txt
│   └── appointment-booking-production-multiarch.tar.gz
├── package-lock.json
├── package.json
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── db.js
│   ├── security.js
│   └── server.js
└── test/
    └── server.test.js
```

`node_modules/`, `.env`, and `data/` are generated locally and are not part of the project files.

## Run without source files

Share only the three files in `dist/`. The image archive contains Linux AMD64 and ARM64 variants and needs only Docker to run. `dist/README.txt` has the load and run commands, including the required environment settings and checksum verification. The archive contains no credentials or user database.

## Run with Docker

From this folder:

1. Copy `.env.example` to `.env` and set a unique `ADMIN_PASSWORD` of at least 12 characters. Keep this file private.
2. Build and start the container:

```sh
docker build -t appointment-booking-production .
docker run --name appointment-booking-production -p 3000:3000 \
  --env-file .env \
  -v appointment_booking_production_data:/data \
  --restart unless-stopped \
  appointment-booking-production
```

Open <http://localhost:3000>. The admin email and password come from `.env`; other users can sign up in the browser. The container always listens on port 3000. The named volume preserves users, sessions, slots, and bookings when the container restarts.

For an HTTPS deployment, put a reverse proxy in front of the container, set `APP_ORIGIN` to the exact public origin such as `https://booking.example.com`, and set `COOKIE_SECURE=true`. Terminate TLS at the proxy and forward requests to port 3000. Keep the app reachable only through that proxy. `APP_ORIGIN` is also used to reject cross-origin writes, so it must match the URL used in the browser exactly, including the port if nonstandard.

## Operations

- Keep one app container connected to a given SQLite volume. Back up the volume regularly. SQLite uses WAL mode; use a SQLite-aware backup or stop the container while copying the database.
- The first startup creates the admin account. Changing `ADMIN_PASSWORD` in `.env` later does **not** change the stored password; this version has no password reset screen. Preserve the credential and database backup.
- A booked slot cannot be removed until its booking is cancelled. Cancelled bookings remain visible in history. Times are stored in UTC and displayed in the browser's local time zone.
- Sessions expire after seven days. Passwords are salted and hashed with scrypt; session cookies are HTTP-only and SameSite Strict. State-changing requests require a CSRF token and the configured origin. Login and signup requests are rate limited per process.
- Run one container per database. The in-memory rate limiter resets when the container restarts; for an internet-facing service, also configure request limits at the reverse proxy.

## Local tests

```sh
npm ci
npm test
```

The test suite covers signup, login, admin permissions, slot conflicts, booking ownership, cancellation, CSRF, origin checks, and login throttling.
