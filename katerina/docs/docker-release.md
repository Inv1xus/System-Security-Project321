# Docker build and release guide

Use the [local-only launch workflow](../README.md#docker-quick-start) and the [application index](../README.md#applications) when selecting a service.

## Build inputs

The root build context selects application code and build inputs. It excludes local environment files, databases, installed dependencies, and manual security evidence. The [Google AI Studio Dockerfile](../packaging/google.Dockerfile) uses Node 24 and Bun to resolve dependencies and build the frontend. The [Kiro Dockerfile](../packaging/kiro.Dockerfile) uses Node 20 for apps with older native modules and Node 24 for Kiro Notes Secure. Bun resolves manifest and lockfile differences inside the image build, while Kiro apps without npm lockfiles resolve package ranges. These builds reproduce the procedure. Exact dependencies can vary where resolution is unfrozen.

## Runtime configuration

The [container entry point](../packaging/start.sh) generates signing secrets at startup. Kiro Booking Secure also receives a generated bootstrap admin password by default. For a disposable admin login you control, supply `SOEN321_ADMIN_PASSWORD` in the host environment before starting the relevant security-focused Booking service. Google AI Studio Booking Secure also accepts `SOEN321_ADMIN_EMAIL` for bootstrap. Use disposable values and unset them when done. Kiro Notes Secure uses its existing local HTTP test setting for its form session.

## Load and run a v1.0.0 archive

Download the archive for your Docker platform from the GitHub repository hosting the release. The [release manifest](../packaging/release-manifest.md) lists the exact filenames, image tags, sizes, and checksums. AMD64 on ARM64 requires working emulation.

Download the checksum asset for your architecture alongside the archive. The asset is named `SHA256SUMS-arm64.txt` for ARM64 or `SHA256SUMS-amd64.txt` for AMD64. The example below verifies one archive and stops before loading if its checksum entry is missing, duplicated, or invalid. For a complete set, run `shasum -a 256 -c SHA256SUMS-arm64.txt` for ARM64 or `shasum -a 256 -c SHA256SUMS-amd64.txt` for AMD64. On Linux, `sha256sum -c` is also available.

```sh
architecture=arm64  # Set to amd64 for the AMD64 archive.
case "$architecture" in
  arm64) override=compose.prebuilt.yaml; tag_suffix= ;;
  amd64) override=compose.amd64.yaml; tag_suffix=-amd64 ;;
esac
archive="google-ai-studio-private-notes-plain-v1.0.0-linux-${architecture}.tar.gz"
image="soen321/google-ai-studio-private-notes-plain:1.0.0${tag_suffix}"
checksum_file="SHA256SUMS-${architecture}.txt"
entry=$(awk -v archive="$archive" '$2 == archive { print; matches++ } END { if (matches != 1) exit 1 }' "$checksum_file") &&
  printf '%s\n' "$entry" | shasum -a 256 -c - &&
  docker image load --input "$archive" &&
  docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image"
```

From the project root (`katerina/` in the team repository), stop any containers that occupy the [ports in the application index](../README.md#applications). In the same shell, use the base Compose file, the architecture override, and the service name for the image you loaded. Both the [ARM64 override](../compose.prebuilt.yaml) and [AMD64 override](../compose.amd64.yaml) select their own tags and inherit the loopback bindings, disposable databases, and runtime secret configuration.

```sh
docker compose -p "soen321-prebuilt-$architecture" -f compose.yaml -f "$override" \
  up -d --no-build --pull never google-notes-plain
```

To start all eight, load all eight archives and omit the service name. To remove the prebuilt project's containers and its temporary state, run the following command from the project root (`katerina/` in the team repository).

```sh
docker compose -p "soen321-prebuilt-$architecture" -f compose.yaml -f "$override" \
  down --volumes
```

To free disk space, remove an unused versioned tag with `docker image rm` and delete the downloaded archive from your download directory.

## Reproduce Docker smoke checks

With Node 24 and ports 3101–3108 free, run the following commands from the project root (`katerina/` in the team repository). The smoke runner uses a separate Compose project, verifies HTTP responses, loopback bindings, and SQLite storage, and removes its containers and temporary state afterward.

For locally built images:

```sh
docker compose build
node packaging/smoke.mjs
```

For the versioned AMD64 images:

```sh
docker compose -f compose.yaml -f compose.amd64.yaml build
node packaging/smoke.mjs --amd64
```

The AMD64 run also verifies Docker's image platform and Node's runtime architecture inside each container. See the [local smoke report](../packaging/smoke-results.md) and [AMD64 smoke report](../packaging/smoke-results-amd64.md).
