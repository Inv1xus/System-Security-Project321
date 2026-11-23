# SOEN 321 · AI-generated web application security evaluation

## Project Overview

This project compares eight builds of two web applications, **Private Notes** and
**Appointment Booking**. Google AI Studio and Kiro each generated one plain-prompt
and one security-focused version of both applications. The security-focused prompts
explicitly requested security controls.

The repository includes the original builds, a shared automated security evaluation,
and a Docker workflow for local reproduction.

## Applications

Use the service name to select a build in Docker Compose.

| Application | Builder | Prompt | SQLite driver | Compose service | Local URL |
|---|---|---|---|---|---|
| [Private Notes](google-ai-studio/notes-plain/) | Google AI Studio | Plain | `better-sqlite3` | `google-notes-plain` | [127.0.0.1:3101](http://127.0.0.1:3101) |
| [Private Notes](google-ai-studio/notes-secure/) | Google AI Studio | Security-focused | `better-sqlite3` | `google-notes-secure` | [127.0.0.1:3102](http://127.0.0.1:3102) |
| [Private Notes](kiro/notes-plain/) | Kiro | Plain | `better-sqlite3` | `kiro-notes-plain` | [127.0.0.1:3105](http://127.0.0.1:3105) |
| [Private Notes](kiro/notes-secure/) | Kiro | Security-focused | `node:sqlite` | `kiro-notes-secure` | [127.0.0.1:3106](http://127.0.0.1:3106) |
| [Appointment Booking](google-ai-studio/booking-plain/) | Google AI Studio | Plain | `better-sqlite3` | `google-booking-plain` | [127.0.0.1:3103](http://127.0.0.1:3103) |
| [Appointment Booking](google-ai-studio/booking-secure/) | Google AI Studio | Security-focused | `better-sqlite3` | `google-booking-secure` | [127.0.0.1:3104](http://127.0.0.1:3104) |
| [Appointment Booking](kiro/booking-plain/) | Kiro | Plain | `better-sqlite3` | `kiro-booking-plain` | [127.0.0.1:3107](http://127.0.0.1:3107) |
| [Appointment Booking](kiro/booking-secure/) | Kiro | Security-focused | `better-sqlite3` | `kiro-booking-secure` | [127.0.0.1:3108](http://127.0.0.1:3108) |

See [implementation size, test coverage, and security controls](docs/security-evaluation.md#implementation-comparison)
for the detailed comparison.

## Security Testing Results

The automated T01–T06 evaluation recorded **109 passed checks, 10 failed
expectations, and 32 skipped checks**. Passes include functional baselines and
security-control checks. The failed expectations comprise five confirmed
source-code vulnerabilities, four suspected vulnerabilities, and one functional
failure. The automated suite recorded zero confirmed runtime vulnerabilities.

A separate manual assessment reproduced an authentication bypass in a local
Docker deployment of Google AI Studio Notes Plain. That result is outside the
automated totals. Skips indicate untested or inapplicable conditions.

Read the [methodology and comparative analysis](docs/security-evaluation.md),
the [consolidated results](results/comparison.md), or the
[test reproduction instructions](tests/README.md).

## Docker Quick Start

**Run these intentionally vulnerable applications only in an isolated local
environment.** The root Compose configuration binds published ports to
`127.0.0.1`. Use disposable test data and credentials. Each container has its
own temporary SQLite mount, which is discarded when the container stops.

Install Docker Engine with BuildKit and the Compose plugin, or use Docker
Desktop. Start Docker and run the following commands from the project root (`katerina/` in the team repository).

```sh
docker compose config --quiet
docker compose build
docker compose up -d --no-build --pull never
docker compose ps
```

To build and start one application, supply its service name.

```sh
docker compose build google-notes-plain
docker compose up -d --no-build --pull never google-notes-plain
```

Open the application's loopback URL from the table. To stop the project:

```sh
docker compose stop
```

To remove its containers, network, and volumes:

```sh
docker compose down --volumes
```

The built images remain available for later runs. Add `--rmi all` to the
`down` command to remove the project's images as well. See the
[Docker guide](docs/docker-release.md) for build inputs, runtime configuration,
and reproducible smoke checks.

## GitHub Release v1.0.0

The release set has eight single-platform image archives for **Linux ARM64**
and eight for **Linux AMD64**. In the repository hosting the assets, open the
Releases tab, select `v1.0.0`, and download your app's archive and the matching
`SHA256SUMS-arm64.txt` or `SHA256SUMS-amd64.txt`.

Use the [archive verification and launch instructions](docs/docker-release.md#load-and-run-a-v100-archive)
to check SHA-256 before loading, choose the architecture-specific Compose
override, and clean up afterward. The [release manifest](packaging/release-manifest.md)
lists the exact archive filenames, image tags, sizes, and checksums.
