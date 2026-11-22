# Private Notes

A small, production-ready private notes web app: sign up, log in, log out, and
create / view / edit / delete notes that only you can see.

- **Runtime:** Node.js 22 + Express 5
- **Storage:** SQLite (`better-sqlite3`), one file on a mounted volume
- **Interface:** server-served static HTML/CSS/JS (no build step, no CDN)
- **Port:** 3000

## Folder structure

```
private-notes-app-production-claudeOpus5High/
├── Dockerfile                 # Multi-stage build, non-root runtime
├── docker-compose.yml         # Hardened run configuration + named volume
├── .dockerignore
├── .gitignore
├── .env.example               # All supported environment variables
├── package.json
├── package-lock.json
├── README.md
├── dist/                      # Distributable prebuilt image (no source needed)
│   ├── private-notes-image-multiarch.tar.gz   # OCI archive: amd64 + arm64
│   ├── SHA256SUMS.txt
│   ├── docker-compose.yml     # Runs the loaded image
│   └── README.md              # Load-and-run instructions
├── public/                    # Static front-end (served by Express)
│   ├── index.html
│   ├── app.js                 # Vanilla JS client; no innerHTML, CSRF-aware
│   └── styles.css
├── scripts/
│   └── smoke-test.mjs         # End-to-end test incl. authz/CSRF/XSS checks
└── src/
    ├── server.js              # Entrypoint: listen, timeouts, graceful shutdown
    ├── app.js                 # Express app: headers, sessions, routes
    ├── config.js              # Env parsing, limits, session-secret handling
    ├── constants.js
    ├── db.js                  # Schema + prepared (parameterized) statements
    ├── lib/
    │   ├── password.js        # scrypt hashing / constant-time verification
    │   └── session-store.js   # Server-side session store on SQLite
    ├── middleware/
    │   ├── auth.js            # requireAuth, session regeneration on login
    │   ├── csrf.js            # Synchronizer-token CSRF protection
    │   ├── errors.js          # 404 + opaque 500 handler
    │   └── validate.js        # Input validation / normalization
    └── routes/
        ├── auth.js            # /api/auth/signup | login | logout | me
        └── notes.js           # /api/notes CRUD, always scoped to the owner
```

At runtime the container also uses `/data` (mounted volume) for
`notes.sqlite` and, if `SESSION_SECRET` is unset, a generated `session.key`.

## Run it with Docker

### Compose (recommended)

```bash
docker compose up --build -d
```

Then open <http://localhost:3000>.

To set an explicit session secret (recommended for a real deployment):

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") docker compose up --build -d
```

### Plain Docker

```bash
docker build -t private-notes-app-production-claudeOpus5High .
```

```bash
docker run -d --name private-notes -p 3000:3000 -v notes-data:/data --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true -e SESSION_SECRET="$(openssl rand -hex 32)" private-notes-app-production-claudeOpus5High
```

Stop and remove:

```bash
docker rm -f private-notes
```

### From the prebuilt image (no source code)

`dist/` is self-contained — hand that folder to anyone:

```bash
cd dist && gunzip -c private-notes-image-multiarch.tar.gz | docker load && docker compose up -d
```

See `dist/README.md` for checksum verification and configuration.

### Local (without Docker)

```bash
npm install && DATA_DIR=./data NODE_ENV=development npm start
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `production` | Runtime mode |
| `DATA_DIR` | `/data` | Directory for the SQLite database (mount a volume) |
| `SESSION_SECRET` | *generated* | Signs the session cookie; min 32 chars. If unset, a key is generated once and stored at `$DATA_DIR/session.key` (0600) |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS — marks the cookie `Secure` and enables HSTS |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the app |
| `SESSION_TTL_MINUTES` | `120` | Rolling idle session timeout |

> **Deploying behind HTTPS:** set `COOKIE_SECURE=true` and
> `TRUST_PROXY=1` (or however many proxies you actually have). Terminate TLS
> at your proxy; this app speaks plain HTTP inside the container.

## API

All endpoints return JSON. Mutating requests require the session cookie **and**
the `X-CSRF-Token` header (obtained from `GET /api/csrf`).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/api/csrf` | Issues the CSRF token for the current session |
| `POST` | `/api/auth/signup` | Create an account and sign in |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Destroy the session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/notes` | List your notes |
| `POST` | `/api/notes` | Create a note |
| `GET` | `/api/notes/:id` | Read one of your notes |
| `PUT` | `/api/notes/:id` | Update one of your notes |
| `DELETE` | `/api/notes/:id` | Delete one of your notes |

A note belonging to another user always returns `404` — never `403` — so note
ids cannot be probed for existence.

## Tests

```bash
npm run smoke
```

Boots the real app against a temporary database and checks authentication,
session regeneration, CSRF rejection, cross-user isolation, validation limits
and injection handling (35 assertions).

## Security summary

| Area | Measure |
| --- | --- |
| Passwords | scrypt (N=65536, r=8, p=1, 64-byte key, per-user 16-byte salt), constant-time compare, dummy hash on unknown accounts to flatten timing |
| Sessions | Server-side in SQLite; cookie holds only a signed random id; `HttpOnly`, `SameSite=Strict`, `Secure` when `COOKIE_SECURE=true`; rolling 2h idle timeout; id regenerated on login (anti session-fixation); destroyed on logout |
| Authorization | Every notes query filters on `user_id`; cross-user access returns 404 |
| CSRF | Synchronizer token in the session, echoed in a custom header; plus `SameSite=Strict` |
| SQL injection | Only prepared statements with bound parameters; no string-built SQL |
| XSS | Strict CSP (`default-src 'none'`, `script-src 'self'`, no inline scripts/styles); client renders user text with `textContent` only |
| Input | Type, length and format validation on every field; control characters stripped; 128 KB JSON body cap; 1000-note per-user cap |
| Rate limiting | 10 logins / 15 min, 5 signups / hour, 300 requests / min overall, per client IP |
| Transport | HSTS, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, restrictive `Permissions-Policy` |
| Errors | Internal errors logged server-side; clients get a generic message, never a stack trace |
| Container | Multi-stage build, production deps only, runs as non-root `node`, read-only root filesystem, all capabilities dropped, `no-new-privileges` |
| Process | Request/header timeouts (Slowloris), graceful SIGTERM shutdown, WAL checkpoint on close |

### Known trade-offs

- **Signup tells you whether an email is already registered** (HTTP 409). Hiding
  this requires an email-verification flow, which this app does not have; signup
  is rate-limited to 5/hour per IP instead.
- **Notes are stored in plaintext** in the SQLite file. They are private between
  users, but anyone with access to the volume (or a host backup) can read them.
  Encrypt the volume if that matters.
- **No email verification, password reset or 2FA.** Adding reset flows needs an
  email provider; be careful to keep the same generic responses.
- **Rate limiting is per client IP and in-process.** It stops ordinary online
  brute force, but not an attacker spread across many addresses; the scrypt cost
  per attempt (~0.2–0.5 s) is the second line of defence. Running multiple
  replicas needs a shared limiter and session store (e.g. Redis).
- **No account lockout after repeated failures.** Deliberate: a per-account
  lockout would let anyone lock a victim out of their own notes.
