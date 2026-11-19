# Appointment Booking

A small appointment booking web app: users sign up, sign in, browse available
time slots, book one, and view or cancel their own bookings. An administrator
sees every booking and can add or remove time slots.

Node.js + Express + SQLite, a plain HTML/CSS/JS front end, and a Docker image.
The app listens on **port 3000**.

---

## Folder structure

```
appointment-booking-app-hardened/
├── Dockerfile                  # multi-stage production image, runs as non-root
├── docker-compose.yml          # read-only rootfs, dropped capabilities, volume
├── .dockerignore
├── .gitignore
├── .env.example                # copy to .env and edit before the first run
├── package.json
├── package-lock.json           # required by `npm ci` in the image build
├── README.md
├── dist/                       # prebuilt image for people who have no source
│   ├── appointment-booking-image-multiarch.tar.gz
│   ├── SHA256SUMS.txt
│   └── README.txt
├── public/                     # static front end (served by Express)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── server.js               # entrypoint: bootstrap, listen, graceful shutdown
│   ├── app.js                  # Express wiring, security headers, rate limits
│   ├── config.js               # validated configuration, read once at startup
│   ├── db.js                   # SQLite connection, PRAGMAs and schema migration
│   ├── lib/
│   │   ├── password.js         # scrypt hashing and constant-time verification
│   │   ├── session.js          # cookie sessions + CSRF token issuing
│   │   ├── tokens.js           # CSPRNG tokens, hashing, timing-safe compare
│   │   └── validate.js         # input validation and the HttpError type
│   ├── middleware/
│   │   ├── auth.js             # requireAuth / requireAdmin
│   │   ├── csrf.js             # Origin check + synchroniser token check
│   │   └── errors.js           # 404 and the single JSON error responder
│   └── routes/
│       ├── auth.js             # signup, login, logout, me, change password
│       ├── slots.js            # available slots for signed-in users
│       ├── bookings.js         # the caller's own bookings
│       └── admin.js            # all bookings, create/remove slots
└── test/
    └── server.test.js          # end-to-end tests over real HTTP
```

A `/data` directory is created inside the container for the SQLite file; it is
not part of the source tree.

---

## Running it with Docker

```bash
cp .env.example .env
```

Edit `.env` and set at least `ADMIN_EMAIL` and `ADMIN_PASSWORD` — that account is
created on first boot and is the only way into the admin screens.

```bash
docker compose up --build
```

Open <http://localhost:3000>.

Without Compose:

```bash
docker build -t appointment-booking .
```

```bash
docker run --rm -p 3000:3000 --env-file .env -v appointment-data:/data --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true appointment-booking
```

The database lives on the `appointment-data` volume, so rebuilding the image
keeps existing accounts and bookings.

### Running it from the prebuilt image (no source needed)

`dist/` holds the same application as a loadable Docker image for **linux/amd64
and linux/arm64**, so anyone can run it with Docker alone - no source tree, no
Node.js, no build:

```bash
docker load -i dist/appointment-booking-image-multiarch.tar.gz
```

```bash
docker run --name appointment-booking -p 3000:3000 --env-file booking.env -e SECURE_COOKIES=never -v appointment_booking_data:/data --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true appointment-booking:1.0.0
```

`dist/README.txt` is the standalone instructions to hand over with the archive;
`dist/SHA256SUMS.txt` lets the recipient verify the download
(`shasum -a 256 -c SHA256SUMS.txt`). To rebuild it after changing the code:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t appointment-booking:1.0.0 -t appointment-booking:latest --provenance=false --sbom=false -o type=oci,dest=dist/appointment-booking-image-multiarch.tar . && gzip -9 -f dist/appointment-booking-image-multiarch.tar && (cd dist && shasum -a 256 appointment-booking-image-multiarch.tar.gz > SHA256SUMS.txt)
```

### Running it without Docker

```bash
npm ci && cp .env.example .env && npm start
```

```bash
npm test
```

---

## Configuration

Every setting is read once at startup and validated; a bad value stops the
process instead of silently weakening the app. See `.env.example` for the full
list. The ones that matter most:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | The port the app listens on. |
| `DB_FILE` | `/data/app.db` | Keep it on the mounted volume. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | – | First-run admin. Never overwrites an existing account's password. |
| `SECURE_COOKIES` | `auto` | `always` behind a TLS proxy, `never` for plain-HTTP local testing only. |
| `TRUST_PROXY` | `0` | Number of trusted reverse proxies. Only raise to the real count. |
| `SESSION_TTL_MINUTES` | `720` | Idle timeout. |
| `SESSION_ABSOLUTE_TTL_HOURS` | `168` | Hard cap regardless of activity. |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_MINUTES` | `8` / `15` | Per-account lockout. |
| `RATE_LIMIT_*` | see `.env.example` | Per-IP request ceilings. |

---

## HTTP API

All endpoints return JSON. Session state is a `sid` cookie (`HttpOnly`,
`SameSite=Strict`); every state-changing request must also carry the
`X-CSRF-Token` header, whose value the browser reads from the `csrf` cookie or
from `GET /api/auth/me`.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | anyone | Liveness probe. |
| `POST` | `/api/auth/signup` | anyone | Create an account (always role `user`). |
| `POST` | `/api/auth/login` | anyone | Start a session. |
| `POST` | `/api/auth/logout` | anyone | Destroy the current session. |
| `GET` | `/api/auth/me` | anyone | Current user and CSRF token (`null` when signed out). |
| `POST` | `/api/auth/password` | user | Change password; signs out every device. |
| `GET` | `/api/slots` | user | Upcoming slots with remaining capacity. |
| `GET` | `/api/bookings` | user | The caller's own bookings. |
| `POST` | `/api/bookings` | user | Book a slot (`{"slotId": 1}`). |
| `DELETE` | `/api/bookings/:id` | user | Cancel one of the caller's own bookings. |
| `GET` | `/api/admin/slots` | admin | Every slot with booking counts. |
| `POST` | `/api/admin/slots` | admin | Add a slot. |
| `DELETE` | `/api/admin/slots/:id` | admin | Remove a slot (`?force=true` also cancels its bookings). |
| `GET` | `/api/admin/bookings` | admin | Every booking, with the booking user's email. |

Times are ISO-8601 UTC on the wire; the browser renders them in local time.

---

## Security notes

What the code does, and why:

- **Passwords** are hashed with scrypt (N=32768, r=8, p=1) and a per-user random
  salt. Verification is timing-safe, and an unknown email is checked against a
  throwaway hash so sign-in cannot be used to discover who has an account.
- **Sessions** are 256-bit random tokens; only their SHA-256 digests are stored,
  so a database dump cannot be replayed. The cookie is `HttpOnly`,
  `SameSite=Strict` and `Secure` (per `SECURE_COOKIES`). Logging in always mints
  a new identifier, which rules out session fixation. Sessions have both an idle
  and an absolute lifetime, and a password change destroys all of them.
- **CSRF** is blocked twice over: the `Origin`/`Referer` of every unsafe request
  must match this site, and authenticated requests must present the
  per-session synchroniser token in `X-CSRF-Token`.
- **Authorisation** is checked server-side on every request from the role stored
  in the database — never from the cookie or the request body. Sign-up hard-codes
  the `user` role. Users' queries are scoped by `user_id` in SQL, and a booking
  belonging to somebody else returns 404 rather than 403, so ids cannot be probed.
- **SQL injection** is structurally prevented: every query is a prepared
  statement with bound parameters, and no SQL is ever built by concatenation.
- **XSS** is prevented by building the DOM with `textContent` (never `innerHTML`)
  and by a strict Content-Security-Policy (`default-src 'none'`, no inline
  script or style, `frame-ancestors 'none'`).
- **Input validation** is explicit and allow-list based: types, lengths, ranges
  and formats are checked before anything reaches the database, bodies are capped
  at 16 KB, and non-object payloads are rejected outright.
- **Overbooking** is impossible: the capacity check and the insert run inside one
  `BEGIN IMMEDIATE` transaction, backed by a partial unique index on
  `(slot_id, user_id)` for live bookings.
- **Abuse limits**: per-IP rate limits (global, login and sign-up), per-account
  lockout after repeated failures, a cap on active bookings per user, and
  request/header timeouts to blunt slow-loris.
- **Error handling** never leaks internals — only messages that were explicitly
  marked safe reach the client; everything else is a generic 500, logged
  server-side.
- **The container** runs as the unprivileged `node` user with a read-only root
  filesystem, all capabilities dropped and `no-new-privileges`. Only `/data` and
  `/tmp` are writable, and the compiler used to build the native SQLite binding
  is left behind in the build stage.

### Operational requirements

These are the deployment-side obligations the code cannot enforce on its own:

1. **Terminate TLS in front of the app** and set `SECURE_COOKIES=always`. The app
   speaks plain HTTP; without TLS the session cookie travels in the clear.
2. **Set `TRUST_PROXY` to the real number of proxies.** Too high and a client can
   spoof `X-Forwarded-For` to evade rate limiting; too low and all clients are
   rate-limited as one.
3. **Keep `.env` out of version control** and treat `ADMIN_PASSWORD` as a live
   credential. Rotate it after first boot via the change-password endpoint.
4. **Back up the `/data` volume.** It holds every account and booking.
5. **Rebuild the image periodically** to pick up base-image and dependency
   security updates.

### Known, accepted trade-offs

- **Sign-up discloses whether an email is registered** (it must, to report a
  duplicate) while sign-in deliberately does not. Closing this would require
  email-verified registration, which is out of scope here.
- **No email verification or password reset.** There is no mail transport; a
  forgotten password needs an administrator.
- **Slots may not overlap.** The admin API rejects an overlapping window, which
  keeps the schedule unambiguous but means parallel resources need a second
  deployment rather than two concurrent slots.
- **Rate limiting is per-process and in-memory.** It resets on restart and is not
  shared across replicas; running more than one instance needs a shared store.
- **SQLite is single-writer.** It is the right fit for one container, not for
  horizontal scale-out.
