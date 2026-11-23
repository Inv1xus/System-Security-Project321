# System Security Project — SOEN 321

Two small web apps, each built four times, to compare what different AI
assistants produce when asked for the same application — first as a
straightforward build, then again with security hardening asked for explicitly.

Every build is a self-contained Node.js + Express + SQLite app that runs in one
container on port 3000. Each has a prebuilt `linux/amd64` + `linux/arm64` image
attached to its own [release](../../releases).

## Naming

The suffix on each folder says which assistant wrote it:

| Suffix | Author |
| --- | --- |
| `-claudeOpus5High` | Claude (Opus 5, high reasoning effort) |
| `-chatgptSol6High` | ChatGPT (Sol 6, high reasoning effort) |

The word before the suffix is that assistant's own name for the build —
`default` for a first pass, and `hardened` / `production` / `secure` for a
second pass written with security as the goal.

## Appointment Booking

Accounts, sign-in, a list of bookable time slots, booking and cancelling your
own slots, and an admin view over every booking.

| Build | Author | Pass | Release |
| --- | --- | --- | --- |
| [`appointment-booking-app-claudeOpus5High`](appointment-booking-app-claudeOpus5High) | Claude | default | [download](../../releases/tag/appointment-booking-app-claudeOpus5High) |
| [`appointment-booking-app-hardened-claudeOpus5High`](appointment-booking-app-hardened-claudeOpus5High) | Claude | hardened | [download](../../releases/tag/appointment-booking-app-hardened-claudeOpus5High) |
| [`appointment-booking-app-default-chatgptSol6High`](appointment-booking-app-default-chatgptSol6High) | ChatGPT | default | [download](../../releases/tag/appointment-booking-app-default-chatgptSol6High) |
| [`appointment-booking-app-production-chatgptSol6High`](appointment-booking-app-production-chatgptSol6High) | ChatGPT | production | [download](../../releases/tag/appointment-booking-app-production-chatgptSol6High) |

## Private Notes

Accounts, sign-in, sign-out, and notes that only their owner can read or edit.

| Build | Author | Pass | Release |
| --- | --- | --- | --- |
| [`private-notes-app-claudeOpus5High`](private-notes-app-claudeOpus5High) | Claude | default | [download](../../releases/tag/private-notes-app-claudeOpus5High) |
| [`private-notes-app-production-claudeOpus5High`](private-notes-app-production-claudeOpus5High) | Claude | production | [download](../../releases/tag/private-notes-app-production-claudeOpus5High) |
| [`private-notes-app-default-chatgptSol6High`](private-notes-app-default-chatgptSol6High) | ChatGPT | default | [download](../../releases/tag/private-notes-app-default-chatgptSol6High) |
| [`private-notes-app-secure-chatgptSol6High`](private-notes-app-secure-chatgptSol6High) | ChatGPT | secure | [download](../../releases/tag/private-notes-app-secure-chatgptSol6High) |

## How the builds differ

Sizes are `src/` only. "Hand-rolled" means the protection is written in the
app's own code rather than pulled from a library.

| Build | SQLite driver | `src/` size | Tests | Defences present |
| --- | --- | --- | --- | --- |
| appointment · Claude default | `node:sqlite` | 7 files, 453 lines | — | scrypt, `HttpOnly`, `SameSite` |
| appointment · Claude hardened | `better-sqlite3` | 15 files, 1581 lines | `server.test.js` | + helmet, `express-rate-limit`, CSRF tokens, account lockout |
| appointment · ChatGPT default | `node:sqlite` | 3 files, 286 lines | `server.test.js` | scrypt, `HttpOnly`, `SameSite`, CSRF tokens |
| appointment · ChatGPT production | `node:sqlite` | 3 files, 348 lines | `server.test.js` | + hand-rolled rate limiting, CSP, origin check |
| notes · Claude default | `node:sqlite` | 5 files, 382 lines | — | scrypt, `HttpOnly`, `SameSite` |
| notes · Claude production | `better-sqlite3` | 13 files, 855 lines | `smoke-test.mjs` | + helmet, `express-rate-limit`, CSRF tokens |
| notes · ChatGPT default | `node:sqlite` | 3 files, 263 lines | `app.test.js` | scrypt, `HttpOnly`, `SameSite` |
| notes · ChatGPT secure | `node:sqlite` | 3 files, 314 lines | `server.test.js` | + hand-rolled rate limiting, CSP, CSRF tokens |

Both assistants reached for scrypt password hashing and `HttpOnly` +
`SameSite` session cookies even in their first pass. The hardening passes
diverge: Claude's pull in `helmet` and `express-rate-limit` and split the app
across many small modules, while ChatGPT's stay at three files and implement
the same protections by hand.

## Running a prebuilt image

No source needed. Each release page carries the exact command for that build,
including the environment variables it requires. The shape is:

```sh
gunzip -c <archive>.tar.gz | docker load
```

Then open <http://localhost:3000>. Docker picks the architecture matching your
machine. Verify a download with `shasum -a 256 -c SHA256SUMS.txt`.

Two caveats:

- The ChatGPT **appointment default** and Claude **appointment hardened**
  images both load as `appointment-booking:1.0.0`. Loading both overwrites one,
  so retag the first before loading the second.
- `private-notes-image.tar` in the ChatGPT notes default release is **not**
  gzipped, unlike the other seven. Load it with `docker load -i`.

## Building from source

Each folder is independent and carries its own README with full instructions:

```sh
cd <build-folder> && npm install && npm start
```

Builds that have a `test` script run with `npm test`; the Claude notes
production build uses `npm run smoke` instead.

## Not in this repo

`.gitignore` keeps out `node_modules/`, the SQLite data files, real `.env`
files, and each build's `dist/` release archive. The archives are roughly
1.26 GB in total and live on the [releases](../../releases) instead — fetch the
image from there, or rebuild it with that folder's documented build command.
