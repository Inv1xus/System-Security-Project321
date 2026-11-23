FROM node:22-bookworm-slim

WORKDIR /app

# Install build tools in case better-sqlite3 needs native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build && mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/appointments.db

EXPOSE 3000

CMD ["npm", "start"]
