# Prebuilt Docker image release manifest

Version 1.0.0 contains separate, single-platform archives for Linux ARM64 and Linux AMD64. For download, checksum verification, startup, and cleanup commands, see the [Docker release guide](../docs/docker-release.md#load-and-run-a-v100-archive).

Release checksum assets are named `SHA256SUMS-arm64.txt` and `SHA256SUMS-amd64.txt`. Each contains the eight checksums for its architecture.

## Linux ARM64

See the [ARM64 manifest](arm64-release-manifest.md) for the eight archive filenames, image tags, sizes, SHA-256 checksums, and verified loads. Use the [ARM64 Compose override](../compose.prebuilt.yaml).

## Linux AMD64

All eight images built with Buildx and passed the [AMD64 smoke checks](smoke-results-amd64.md) under Docker emulation on an ARM64 host. These checks are separate from the T01–T06 security evaluation. Use the [AMD64 Compose override](../compose.amd64.yaml).

After the smoke run, each archive passed its gzip and SHA-256 checks. Docker loaded each archive as Linux AMD64 with the expected versioned tag and source image ID.

| Compose service | Archive | Image tag | Platform | Bytes | SHA-256 | Docker load |
|---|---|---|---|---:|---|---|
| `google-notes-default` | `google-ai-studio-private-notes-plain-v1.0.0-linux-amd64.tar.gz` | `soen321/google-ai-studio-private-notes-plain:1.0.0-amd64` | `linux/amd64` | 139,116,746 | `6e57ac1a733a1f93c690547b062f74126ba36d6a0843e3ff9120f79c539bac57` | Verified |
| `google-notes-secure` | `google-ai-studio-private-notes-security-focused-v1.0.0-linux-amd64.tar.gz` | `soen321/google-ai-studio-private-notes-security-focused:1.0.0-amd64` | `linux/amd64` | 140,467,787 | `71cf8f9d859e1891b4686245132872bb9ec5190e1a1291e409930261bcaa35ac` | Verified |
| `google-booking-default` | `google-ai-studio-appointment-booking-plain-v1.0.0-linux-amd64.tar.gz` | `soen321/google-ai-studio-appointment-booking-plain:1.0.0-amd64` | `linux/amd64` | 139,352,864 | `21167e28e34936802413703d96de044aeaf1f8882a4b03074898b6172b43c9e0` | Verified |
| `google-booking-secure` | `google-ai-studio-appointment-booking-security-focused-v1.0.0-linux-amd64.tar.gz` | `soen321/google-ai-studio-appointment-booking-security-focused:1.0.0-amd64` | `linux/amd64` | 140,485,281 | `999915dd928140944ceaf832a3bd6af72423f1ee00cc4933a5965fb06913b896` | Verified |
| `kiro-notes-default` | `kiro-private-notes-plain-v1.0.0-linux-amd64.tar.gz` | `soen321/kiro-private-notes-plain:1.0.0-amd64` | `linux/amd64` | 80,865,762 | `d735b21f3dc222b7402c0d45348328b714d9568553f33317326da2bab5ac9210` | Verified |
| `kiro-notes-secure` | `kiro-private-notes-security-focused-v1.0.0-linux-amd64.tar.gz` | `soen321/kiro-private-notes-security-focused:1.0.0-amd64` | `linux/amd64` | 82,748,674 | `f2ebc062dd4d0bdc9af4d52e5164e453d8b8275a74de925b0e3b10681bed8ecb` | Verified |
| `kiro-booking-default` | `kiro-appointment-booking-plain-v1.0.0-linux-amd64.tar.gz` | `soen321/kiro-appointment-booking-plain:1.0.0-amd64` | `linux/amd64` | 75,657,059 | `cebb926e476a730769c28e2bfdb5c93094998a0fc795d2e04fe2056bdc306c89` | Verified |
| `kiro-booking-secure` | `kiro-appointment-booking-security-focused-v1.0.0-linux-amd64.tar.gz` | `soen321/kiro-appointment-booking-security-focused:1.0.0-amd64` | `linux/amd64` | 75,762,215 | `6eb775818600c7cb955a4191991a0b0ec65728339d3c61ed9c5a8a784cce233c` | Verified |

Combined AMD64 archive size is 874,456,388 bytes.
