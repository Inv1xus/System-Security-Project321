# Prebuilt Docker image manifest

Version 1.0.0 · Linux ARM64

Release checksum asset — `SHA256SUMS-arm64.txt`.

These archives were exported from the eight local images used for Docker smoke testing. Each gzip stream passed its integrity check. The versioned tag was removed locally before reloading each archive. Docker restored the expected tag, and its platform and image ID matched the source image. A separate checksum pass verified all eight files.

| Compose service | Archive | Image tag | Platform | Bytes | SHA-256 | Docker load |
|---|---|---|---|---:|---|---|
| `google-notes-plain` | `google-ai-studio-private-notes-plain-v1.0.0-linux-arm64.tar.gz` | `soen321/google-ai-studio-private-notes-plain:1.0.0` | `linux/arm64` | 138,150,274 | `b67ddb3f3c21ee96c1d9bc302d48f91c6e879eb70ab3538489261f590d480ef5` | Verified |
| `google-notes-secure` | `google-ai-studio-private-notes-security-focused-v1.0.0-linux-arm64.tar.gz` | `soen321/google-ai-studio-private-notes-security-focused:1.0.0` | `linux/arm64` | 138,103,582 | `7e5d614c7fde2ab2f4bd9c10c39ad96d6e47d491be88a14895add41b2e217da9` | Verified |
| `google-booking-plain` | `google-ai-studio-appointment-booking-plain-v1.0.0-linux-arm64.tar.gz` | `soen321/google-ai-studio-appointment-booking-plain:1.0.0` | `linux/arm64` | 136,989,759 | `ddca6a7f82fdef4ef88911da6ebf6b2a093ddbccfc334c06bd6ba25b5efd4410` | Verified |
| `google-booking-secure` | `google-ai-studio-appointment-booking-security-focused-v1.0.0-linux-arm64.tar.gz` | `soen321/google-ai-studio-appointment-booking-security-focused:1.0.0` | `linux/arm64` | 138,145,055 | `16d490f88ca00dd9b596fecca209fca719cd7c308c7035893fcaaf913e2c2be3` | Verified |
| `kiro-notes-plain` | `kiro-private-notes-plain-v1.0.0-linux-arm64.tar.gz` | `soen321/kiro-private-notes-plain:1.0.0` | `linux/arm64` | 81,857,382 | `62b07c661273c39ad5adde812d86022bf57bb671ed64456e44c834ff45619c24` | Verified |
| `kiro-notes-secure` | `kiro-private-notes-security-focused-v1.0.0-linux-arm64.tar.gz` | `soen321/kiro-private-notes-security-focused:1.0.0` | `linux/arm64` | 82,428,043 | `925d0a805b6c2df66800ffbce7fc42a7c6f99937b4ce0cf90d5c192984c5d23f` | Verified |
| `kiro-booking-plain` | `kiro-appointment-booking-plain-v1.0.0-linux-arm64.tar.gz` | `soen321/kiro-appointment-booking-plain:1.0.0` | `linux/arm64` | 75,244,823 | `b8b98658635a86cc3931247a65eb44e59321ff38364212e4cfe5a90e7b30c518` | Verified |
| `kiro-booking-secure` | `kiro-appointment-booking-security-focused-v1.0.0-linux-arm64.tar.gz` | `soen321/kiro-appointment-booking-security-focused:1.0.0` | `linux/arm64` | 75,351,079 | `391d35db0101146a8dedde7c2956c9c80fcab770cdb61ce6f4c520e516a95848` | Verified |

Combined archive size is 866,269,997 bytes.

For checksum verification and local startup, see the [prebuilt image instructions](../docs/docker-release.md#load-and-run-a-v100-archive).
