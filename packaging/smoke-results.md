# Docker packaging smoke results

These startup and HTTP checks are separate from the T01–T06 security evaluation.

Run date (UTC) — 2026-11-23

Engine — 29.9.2 linux/arm64
Compose — 5.6.1

Compose configuration validated eight unique image tags and host ports, each published only on IPv4 loopback.
A present image means the tagged image was available locally when smoke testing started.

| Service | Image | Startup | Loopback | Temporary mount | SQLite header | Page | API or redirect | Smoke |
|---|---|---|---|---|---|---|---|---|
| google-notes-plain | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| google-notes-secure | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| google-booking-plain | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| google-booking-secure | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| kiro-notes-plain | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 401 | Pass |
| kiro-notes-secure | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 302 | Pass |
| kiro-booking-plain | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 401 | Pass |
| kiro-booking-secure | Present | running | Pass | Pass | Pass | HTTP 200 | HTTP 401 | Pass |

Compose startup command — Successful.
Smoke project cleanup — Successful.
