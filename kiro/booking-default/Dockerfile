# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so the layer is cached when only source changes
COPY package.json ./

RUN npm install --production

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Create a non-root user for the process
RUN addgroup -S booking && adduser -S booking -G booking

# Persistent volume for the SQLite database
RUN mkdir -p /app/data && chown booking:booking /app/data
VOLUME ["/app/data"]

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Ensure the app files are owned by the non-root user
RUN chown -R booking:booking /app

USER booking

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/app/data/booking.db

CMD ["node", "server.js"]
