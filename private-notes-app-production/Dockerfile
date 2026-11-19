# syntax=docker/dockerfile:1

############################
# Stage 1 — build deps
############################
FROM node:22-bookworm-slim AS deps

# better-sqlite3 ships prebuilt binaries; these tools are only the fallback
# path when no prebuild matches the target platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./

# Production dependencies only — no dev tooling in the final image.
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

############################
# Stage 2 — runtime
############################
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Writable data directory owned by the unprivileged runtime user.
RUN mkdir -p /data && chown -R node:node /data

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# Never run the application as root.
USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
