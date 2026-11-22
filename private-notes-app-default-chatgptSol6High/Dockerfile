FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/notes.sqlite

USER node
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
