# Running the evaluation stack locally

The Docker Compose stack in this repository builds and runs the eight **Google
AI Studio** and **Kiro** builds — the ones the automated T01–T06 harness covers.
The Claude and ChatGPT builds are not part of this stack; each runs on its own
from its folder README, as the [build index](../README.md#applications)
describes.

For methodology and findings, read the [security evaluation](security-evaluation.md),
the [consolidated results](../results/comparison.md), or the
[test reproduction instructions](../tests/README.md).

## Applications

Use the service name to select a build in Docker Compose. The service names and
image tags keep the `-plain` label used by the recorded evaluation runs and the
release manifests; the folders they build from are named `-default`.

| Application | Builder | Prompt | SQLite driver | Compose service | Local URL |
|---|---|---|---|---|---|
| [Private Notes](../google-ai-studio/notes-default/) | Google AI Studio | Plain | `better-sqlite3` | `google-notes-plain` | [127.0.0.1:3101](http://127.0.0.1:3101) |
| [Private Notes](../google-ai-studio/notes-secure/) | Google AI Studio | Security-focused | `better-sqlite3` | `google-notes-secure` | [127.0.0.1:3102](http://127.0.0.1:3102) |
| [Private Notes](../kiro/notes-default/) | Kiro | Plain | `better-sqlite3` | `kiro-notes-plain` | [127.0.0.1:3105](http://127.0.0.1:3105) |
| [Private Notes](../kiro/notes-secure/) | Kiro | Security-focused | `node:sqlite` | `kiro-notes-secure` | [127.0.0.1:3106](http://127.0.0.1:3106) |
| [Appointment Booking](../google-ai-studio/booking-default/) | Google AI Studio | Plain | `better-sqlite3` | `google-booking-plain` | [127.0.0.1:3103](http://127.0.0.1:3103) |
| [Appointment Booking](../google-ai-studio/booking-secure/) | Google AI Studio | Security-focused | `better-sqlite3` | `google-booking-secure` | [127.0.0.1:3104](http://127.0.0.1:3104) |
| [Appointment Booking](../kiro/booking-default/) | Kiro | Plain | `better-sqlite3` | `kiro-booking-plain` | [127.0.0.1:3107](http://127.0.0.1:3107) |
| [Appointment Booking](../kiro/booking-secure/) | Kiro | Security-focused | `better-sqlite3` | `kiro-booking-secure` | [127.0.0.1:3108](http://127.0.0.1:3108) |

See [implementation size, test coverage, and security controls](security-evaluation.md#implementation-comparison)
for the detailed comparison.

## Docker Quick Start

**Run these intentionally vulnerable applications only in an isolated local
environment.** The root Compose configuration binds published ports to
`127.0.0.1`. Use disposable test data and credentials. Each container has its
own temporary SQLite mount, which is discarded when the container stops.

Install Docker Engine with BuildKit and the Compose plugin, or use Docker
Desktop. Start Docker and run the following commands from the repository root.

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
[Docker guide](docker-release.md) for build inputs, runtime configuration,
and reproducible smoke checks.

## GitHub Release v1.0.0

The release set has eight single-platform image archives for **Linux ARM64**
and eight for **Linux AMD64**. In the repository hosting the assets, open the
Releases tab, select `v1.0.0`, and download your app's archive and the matching
`SHA256SUMS-arm64.txt` or `SHA256SUMS-amd64.txt`.

Use the [archive verification and launch instructions](docker-release.md#load-and-run-a-v100-archive)
to check SHA-256 before loading, choose the architecture-specific Compose
override, and clean up afterward. The [release manifest](../packaging/release-manifest.md)
lists the exact archive filenames, image tags, sizes, and checksums.
