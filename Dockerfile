FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.build.json vite.config.ts ./
COPY prisma ./prisma
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --no-audit --no-fund
RUN npm run db:generate
COPY src ./src
COPY lib ./lib
COPY apps ./apps
RUN npm run build

FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="轻账 Web" \
      org.opencontainers.image.description="NestJS + Pi Agent 的本地优先记账应用" \
      org.opencontainers.image.version="2.0.0"

ENV NODE_ENV=production \
    PORT=3218 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    INITIAL_LEDGER_PATH=/app/seed/initial-ledger.json

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-web ./dist-web
COPY data/initial-ledger.json ./seed/initial-ledger.json

RUN mkdir -p /app/data /home/node/.pi/agent \
    && chown -R node:node /app/data /home/node/.pi

VOLUME ["/app/data"]
EXPOSE 3218

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3218/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["sh", "-c", "chown -R node:node /app/data /home/node/.pi/agent && exec gosu node sh -c 'node node_modules/prisma/build/index.js migrate deploy && exec node dist/src/main.js'"]
