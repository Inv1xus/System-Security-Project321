# Appointment Booking App

Express + SQLite appointment booking. Users sign up, log in, see free time slots,
book one, and view or cancel their own bookings. An admin sees every booking and
adds or removes time slots.

## Folder structure

```
appointment-booking-app-claudeOpus5High/
├── Dockerfile
├── .dockerignore
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── dist/                   # prebuilt multi-arch image, no source needed
│   ├── appointment-booking-claude-multiarch.tar.gz
│   ├── SHA256SUMS.txt
│   └── README.txt
├── public/                 # the web interface (plain HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── src/
    ├── server.js           # Express app, static files, startup
    ├── db.js               # SQLite connection + schema
    ├── auth.js             # password hashing, sessions, access checks
    └── routes/
        ├── auth.js         # signup, login, logout, me
        ├── slots.js        # free slots for users
        ├── bookings.js     # book, list own, cancel
        └── admin.js        # all bookings, add/remove slots
```

## Run the prebuilt image (no source code needed)

`dist/` holds the finished image for Linux AMD64 and ARM64. Anyone with Docker
can run it without this repository:

```bash
docker load -i dist/appointment-booking-claude-multiarch.tar.gz
docker run --name appointment-booking -p 3000:3000 -v appointment_data:/data appointment-booking-claude:1.0.0
```

Docker picks the matching architecture by itself. `dist/README.txt` is the
standalone instructions to hand over with the archive, and `dist/SHA256SUMS.txt`
verifies the download (`shasum -a 256 -c SHA256SUMS.txt`).

Loading a two-architecture archive needs Docker's containerd image store —
the default in Docker Desktop 4.34+ and Docker Engine 25+.

## Build and run from source

```bash
docker build -t appointment-booking-claude .
docker run --rm -p 3000:3000 -v appointment-data:/data appointment-booking-claude
```

Open <http://localhost:3000>.

The named volume `appointment-data` keeps the database between runs. Drop
`-v appointment-data:/data` for a throwaway instance.

### Admin account

An admin is created on first boot. The defaults are:

| Email | Password |
| --- | --- |
| `admin@example.com` | `admin12345` |

Set your own before the first run:

```bash
docker run --rm -p 3000:3000 -v appointment-data:/data -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='a-long-password' appointment-booking-claude
```

The admin is only created when that email is not already in the database, so
changing these later does not rewrite an existing account.

## Run without Docker

```bash
npm install
npm start
```

Needs Node 22.5 or newer (the app uses the built-in `node:sqlite` module).
The database is written to `./data/appointments.db`.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | bind address |
| `DATA_DIR` | `/data` in Docker, `./data` otherwise | where the SQLite file goes |
| `ADMIN_EMAIL` | `admin@example.com` | admin account created on first boot |
| `ADMIN_PASSWORD` | `admin12345` | password for that account |
| `COOKIE_SECURE` | `false` | set to `true` when serving over HTTPS |

## How to use it

As a user: sign up, pick a free slot from **Available time slots** and press
**Book**. The booking shows under **My bookings**, where **Cancel** releases the
slot back to everyone.

As the admin: log in with the admin account. **Add a time slot** takes a start
and end time; **All time slots** shows each slot as free or who holds it, with
**Remove** to delete it; **All bookings** lists every booking in the system.
Removing a booked slot cancels its booking.

## API

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | anyone | create an account and sign in |
| POST | `/api/auth/login` | anyone | sign in |
| POST | `/api/auth/logout` | anyone | sign out |
| GET | `/api/auth/me` | signed in | the current account |
| GET | `/api/slots` | signed in | free future slots |
| GET | `/api/bookings` | signed in | your own bookings |
| POST | `/api/bookings` | signed in | book a slot (`{"slotId": 1}`) |
| DELETE | `/api/bookings/:id` | signed in | cancel your own booking |
| GET | `/api/admin/bookings` | admin | every booking |
| GET | `/api/admin/slots` | admin | every slot, free or taken |
| POST | `/api/admin/slots` | admin | add a slot (`{"startsAt": "...", "endsAt": "..."}`, ISO times) |
| DELETE | `/api/admin/slots/:id` | admin | remove a slot |
| GET | `/health` | anyone | liveness check |

## Notes on the implementation

- Passwords are stored as scrypt hashes with a per-password random salt
  (`node:crypto`), compared in constant time.
- Sessions are random 32-byte tokens in an `HttpOnly`, `SameSite=Strict` cookie;
  only the SHA-256 hash of a token is kept in the database, and expired rows are
  purged hourly.
- Every query is a prepared statement with bound parameters.
- `bookings.slot_id` is `UNIQUE`, so two people racing for the same slot cannot
  both get it — the loser gets a 409.
- Cancelling and removing check ownership and role server-side; the browser's
  hidden sections are convenience, not the access control.
- The page builds table cells with `textContent`, so an email address can never
  be parsed as HTML.
- Times are stored as UTC ISO strings and rendered in the viewer's local zone.
