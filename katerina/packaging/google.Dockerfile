FROM node:24.9.0-bookworm-slim AS build
ARG APP_DIR
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global bun@1.4.5 --no-audit --no-fund
COPY ${APP_DIR}/package.json ${APP_DIR}/bun.lock ./
# The generated manifests and Bun locks differ. Resolve against the staged copy.
RUN bun install --no-progress
COPY ${APP_DIR}/ ./
RUN npm run build

FROM node:24.9.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/ /app/
COPY --chmod=755 packaging/start.sh /usr/local/bin/soen321-start
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/soen321-start"]
CMD ["node", "server.ts"]
