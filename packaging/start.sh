#!/bin/sh
set -eu

random_secret() {
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
}

if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET=$(random_secret)
fi
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET=$(random_secret)
fi
export SESSION_SECRET JWT_SECRET

if [ "${SOEN321_SEED_ADMIN:-}" = "true" ] && [ -z "${ADMIN_PASSWORD:-}" ]; then
  ADMIN_PASSWORD=$(random_secret)
  export ADMIN_PASSWORD
fi

exec "$@"
