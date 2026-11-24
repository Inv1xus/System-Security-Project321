ARG NODE_VERSION=20.19.5
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG APP_DIR
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY ${APP_DIR}/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; \
    else npm install --omit=dev --no-audit --no-fund; fi
COPY ${APP_DIR}/ ./

FROM node:${NODE_VERSION}-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/ /app/
COPY --chmod=755 packaging/start.sh /usr/local/bin/soen321-start
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/soen321-start"]
CMD ["node", "server.js"]
