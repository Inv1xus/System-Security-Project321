# ---- Build stage ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# ---- Runtime stage ----
FROM node:20-alpine

WORKDIR /app

# Create a non-root user for security
RUN addgroup -S notes && adduser -S notes -G notes

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY public ./public

# SQLite databases will live here; mount a volume to persist them
RUN mkdir -p data && chown -R notes:notes /app

USER notes

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
