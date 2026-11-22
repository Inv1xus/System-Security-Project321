# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 - install production dependencies (needs a toolchain for better-sqlite3)
###############################################################################
FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Reproducible install from the lockfile, production dependencies only.
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

###############################################################################
# Stage 2 - runtime image: no compiler, no npm cache, no source of the toolchain
###############################################################################
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/app.db \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Writable data directory owned by the unprivileged runtime user. A named volume
# mounted here inherits this ownership.
RUN mkdir -p /data && chown node:node /data

COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
COPY --chown=root:root src ./src
COPY --chown=root:root public ./public

# The application never writes to its own code: everything but /data is
# root-owned and read-only to the runtime user.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
