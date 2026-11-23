# ==========================================
# VaultNotes - Production Dockerfile
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install native dependencies required to compile better-sqlite3
RUN apk add --no-cache python3 make g++ gcc

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# Copy source code
COPY . .

# Build Vite client assets into /app/dist
RUN npm run build

# ==========================================
# Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies for SQLite
RUN apk add --no-cache sqlite-libs

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules, build outputs, and server files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./

# Create data directory for SQLite database storage & mount as volume
RUN mkdir -p /app/data

VOLUME ["/app/data"]

# Expose web application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start the Node.js Express server
CMD ["npm", "start"]
