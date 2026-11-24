# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build toolchain needed for native addons (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy manifests first so Docker layer-caches the install step.
# package-lock.json may not exist yet on first build; fall back to npm install.
COPY package.json package-lock.json* ./

RUN npm install --omit=dev && npm prune --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Install native runtime libraries required by better-sqlite3
RUN apk add --no-cache sqlite-libs

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY server.js db.js ./
COPY middleware/ ./middleware/
COPY routes/     ./routes/
COPY public/     ./public/

# Create the data directory and hand it to the app user
RUN mkdir -p /data && chown appuser:appgroup /data

USER appuser

# Expose the application port
EXPOSE 3000

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

# Health check — hits the /api/auth/me endpoint (returns 401, not 500)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/auth/me || exit 1

CMD ["node", "server.js"]
