# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first to leverage layer caching
COPY package*.json ./

# Install all deps (including dev) so we can run any build steps if needed
RUN npm ci --ignore-scripts=false

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Non-root user for least privilege
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts=false \
    && npm cache clean --force

# Copy application source
COPY src/ ./src/
COPY public/ ./public/

# Create the data directory and give ownership to appuser
RUN mkdir -p /data && chown appuser:appgroup /data

# Drop privileges
USER appuser

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# Healthcheck — curl is not in alpine by default; use wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "src/app.js"]
