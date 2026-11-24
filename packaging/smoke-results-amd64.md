# Docker packaging smoke results · Linux AMD64

These startup and HTTP checks are separate from the T01–T06 security evaluation.

Run date (UTC) — 2026-11-23

Engine — 29.9.2 linux/arm64
Compose — 5.6.1

Compose configuration validated eight unique image tags and host ports, each published only on IPv4 loopback.
Image platforms were verified by Docker inspection. Node reported Linux x64 inside each passing container.

| Service | Image platform | AMD64 runtime | Startup | Loopback | Temporary mount | SQLite header | Page | API or redirect | Smoke |
|---|---|---|---|---|---|---|---|---|---|
| google-notes-default | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| google-notes-secure | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| google-booking-default | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| google-booking-secure | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 200 | Pass |
| kiro-notes-default | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 401 | Pass |
| kiro-notes-secure | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 302 | Pass |
| kiro-booking-default | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 401 | Pass |
| kiro-booking-secure | linux/amd64 | Pass | running | Pass | Pass | Pass | HTTP 200 | HTTP 401 | Pass |

Compose startup command — Successful.
Smoke project cleanup — Successful.
