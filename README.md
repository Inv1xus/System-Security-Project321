# SOEN 321 — AI-generated web application security

Two small web applications, each built by four different AI coding assistants,
twice over: once from a plain prompt, then again from a prompt that explicitly
asked for security hardening. **Sixteen builds in total**, plus an automated
security evaluation of eight of them.

Every build is a self-contained Node.js + Express + SQLite app that listens on
port 3000.

## Repository layout

```
claude-opus-5/        Claude (Opus 5, high reasoning effort)
chatgpt-sol-6/        ChatGPT (Sol 6, high reasoning effort)
google-ai-studio/     Google AI Studio
kiro/                 Kiro
  ├── booking-default/    Appointment Booking, plain prompt
  ├── booking-secure/     Appointment Booking, security-focused prompt
  ├── notes-default/      Private Notes, plain prompt
  └── notes-secure/       Private Notes, security-focused prompt

docs/                 methodology, local stack, release handling
tests/                automated T01–T06 security harness
results/              per-build JSON plus the generated comparison.md
packaging/            Dockerfiles, release manifests, smoke results
compose*.yaml         local Docker stack
```

Each of the four builder folders holds the same four build names, so any path is
predictable: `<builder>/<app>-<pass>`.

## Naming

| Suffix | Meaning |
| --- | --- |
| `-default` | First pass. Plain prompt, nothing about security. |
| `-secure` | Second pass. The prompt explicitly asked for hardening. |

Each assistant originally picked its own word for the second pass. The folders
are normalized so paths stay predictable; the **Original name** column below
records what each assistant actually called its own build.

## Applications

### Private Notes

Accounts, sign-in, sign-out, and notes only their owner can read or edit.

| Build | Builder | Pass | Original name | Release |
| --- | --- | --- | --- | --- |
| [`claude-opus-5/notes-default`](claude-opus-5/notes-default) | Claude | default | — | [download](../../releases/tag/private-notes-app-claudeOpus5High) |
| [`claude-opus-5/notes-secure`](claude-opus-5/notes-secure) | Claude | secure | `production` | [download](../../releases/tag/private-notes-app-production-claudeOpus5High) |
| [`chatgpt-sol-6/notes-default`](chatgpt-sol-6/notes-default) | ChatGPT | default | `default` | [download](../../releases/tag/private-notes-app-default-chatgptSol6High) |
| [`chatgpt-sol-6/notes-secure`](chatgpt-sol-6/notes-secure) | ChatGPT | secure | `secure` | [download](../../releases/tag/private-notes-app-secure-chatgptSol6High) |
| [`google-ai-studio/notes-default`](google-ai-studio/notes-default) | Google AI Studio | default | `plain` | build from source |
| [`google-ai-studio/notes-secure`](google-ai-studio/notes-secure) | Google AI Studio | secure | `secure` | build from source |
| [`kiro/notes-default`](kiro/notes-default) | Kiro | default | `plain` | build from source |
| [`kiro/notes-secure`](kiro/notes-secure) | Kiro | secure | `secure` | build from source |

### Appointment Booking

Accounts, sign-in, a list of bookable time slots, booking and cancelling your
own slots, and an admin view over every booking.

| Build | Builder | Pass | Original name | Release |
| --- | --- | --- | --- | --- |
| [`claude-opus-5/booking-default`](claude-opus-5/booking-default) | Claude | default | — | [download](../../releases/tag/appointment-booking-app-claudeOpus5High) |
| [`claude-opus-5/booking-secure`](claude-opus-5/booking-secure) | Claude | secure | `hardened` | [download](../../releases/tag/appointment-booking-app-hardened-claudeOpus5High) |
| [`chatgpt-sol-6/booking-default`](chatgpt-sol-6/booking-default) | ChatGPT | default | `default` | [download](../../releases/tag/appointment-booking-app-default-chatgptSol6High) |
| [`chatgpt-sol-6/booking-secure`](chatgpt-sol-6/booking-secure) | ChatGPT | secure | `production` | [download](../../releases/tag/appointment-booking-app-production-chatgptSol6High) |
| [`google-ai-studio/booking-default`](google-ai-studio/booking-default) | Google AI Studio | default | `plain` | build from source |
| [`google-ai-studio/booking-secure`](google-ai-studio/booking-secure) | Google AI Studio | secure | `secure` | build from source |
| [`kiro/booking-default`](kiro/booking-default) | Kiro | default | `plain` | build from source |
| [`kiro/booking-secure`](kiro/booking-secure) | Kiro | secure | `secure` | build from source |

The eight release tags keep the folder names the builds had when the images were
published, so a tag does not match its current path. The links above resolve
correctly. The Google AI Studio and Kiro builds have no release in this
repository; their images build from source through
[Docker Compose](docs/running-locally.md).

## Security evaluation

The automated T01–T06 harness in [`tests/`](tests) covers the eight Google AI
Studio and Kiro builds. It recorded **109 passed checks, 10 failed expectations,
and 32 skipped checks** — five confirmed source-code vulnerabilities, four
suspected vulnerabilities, and one functional failure, with zero confirmed
runtime vulnerabilities. A separate manual assessment reproduced an
authentication bypass in a local Docker deployment of Google AI Studio Notes
(plain prompt); that result sits outside the automated totals.

- [Evaluation summary](docs/evaluation-summary.md) — what the 151 results are, and the findings per prompt
- [Methodology and comparative analysis](docs/security-evaluation.md)
- [Consolidated results](results/comparison.md) — generated by `node tests/report.mjs`
- [How to reproduce the runs](tests/README.md)

The Claude and ChatGPT builds are not covered by that harness. Each ships its
own test script instead:

| Build | SQLite driver | `src/` size | Own tests | Defences present |
| --- | --- | --- | --- | --- |
| `claude-opus-5/booking-default` | `node:sqlite` | 7 files, 453 lines | — | scrypt, `HttpOnly`, `SameSite` |
| `claude-opus-5/booking-secure` | `better-sqlite3` | 15 files, 1581 lines | `server.test.js` | + helmet, `express-rate-limit`, CSRF tokens, account lockout |
| `claude-opus-5/notes-default` | `node:sqlite` | 5 files, 382 lines | — | scrypt, `HttpOnly`, `SameSite` |
| `claude-opus-5/notes-secure` | `better-sqlite3` | 13 files, 855 lines | `smoke-test.mjs` | + helmet, `express-rate-limit`, CSRF tokens |
| `chatgpt-sol-6/booking-default` | `node:sqlite` | 3 files, 286 lines | `server.test.js` | scrypt, `HttpOnly`, `SameSite`, CSRF tokens |
| `chatgpt-sol-6/booking-secure` | `node:sqlite` | 3 files, 348 lines | `server.test.js` | + hand-rolled rate limiting, CSP, origin check |
| `chatgpt-sol-6/notes-default` | `node:sqlite` | 3 files, 263 lines | `app.test.js` | scrypt, `HttpOnly`, `SameSite` |
| `chatgpt-sol-6/notes-secure` | `node:sqlite` | 3 files, 314 lines | `server.test.js` | + hand-rolled rate limiting, CSP, CSRF tokens |

Sizes count `src/` only. "Hand-rolled" means the protection is written in the
app's own code rather than pulled from a library. Both assistants reached for
scrypt hashing and `HttpOnly` + `SameSite` cookies even on the plain prompt. The
hardening passes diverge: Claude's pull in `helmet` and `express-rate-limit` and
split the app across many small modules, while ChatGPT's stay at three files and
implement the same protections by hand.

## Running a build

**These are deliberately insecure applications in part. Run them only in an
isolated local environment, with disposable data and credentials.**

**The Google AI Studio and Kiro builds** run together as a Docker Compose stack
on ports 3101–3108 — see [running locally](docs/running-locally.md) for the
service names, build commands, and cleanup, and the
[Docker guide](docs/docker-release.md) for archive handling and smoke checks.

**The Claude and ChatGPT builds** each run on their own, from source:

```bash
cd <builder>/<build> && npm install && npm start
```

Builds with a `test` script run with `npm test`; `claude-opus-5/notes-secure`
uses `npm run smoke` instead. Each folder's own README carries the full
instructions and its required environment variables.

To skip the build step, load that build's prebuilt `linux/amd64` +
`linux/arm64` image from its release. Each release page carries the exact
command, including the environment variables it needs:

```bash
gunzip -c <archive>.tar.gz | docker load
```

Then open <http://localhost:3000>. Docker picks the architecture matching your
machine. Verify a download with `shasum -a 256 -c SHA256SUMS.txt`.

Two caveats on the released archives:

- `chatgpt-sol-6/booking-default` and `claude-opus-5/booking-secure` both load
  as `appointment-booking:1.0.0`. Loading both overwrites one, so retag the
  first before loading the second.
- `private-notes-image.tar` in the `chatgpt-sol-6/notes-default` release is
  **not** gzipped, unlike the other seven. Load it with `docker load -i`.

## Not in this repo

`.gitignore` keeps out `node_modules/`, SQLite data files, real `.env` files, and
each build's `dist/` release archive. Those archives total roughly 1.26 GB and
live on the [releases](../../releases) instead.
