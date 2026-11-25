# Multi-Arch QyroBot Production Container (linux/amd64 & linux/arm64 Ampere VPS)
# PRD v1.7.0 §13.1 — Zero local AI model binaries; 100% Cloud-API + lightweight sandbox.
# Build command:
#   docker buildx build --platform linux/amd64,linux/arm64 -f packaging/Dockerfile -t qyrobot:1.7.0 .

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Jakarta

RUN groupadd -r qyrobot && useradd -r -g qyrobot -m -d /var/lib/qyrobot qyrobot \
    && mkdir -p /app/data /app/configs \
    && chown -R qyrobot:qyrobot /app

COPY --from=builder --chown=qyrobot:qyrobot /app/package.json /app/package-lock.json* ./
COPY --from=builder --chown=qyrobot:qyrobot /app/node_modules ./node_modules
COPY --from=builder --chown=qyrobot:qyrobot /app/dist ./dist
COPY --from=builder --chown=qyrobot:qyrobot /app/server.ts ./server.ts
COPY --from=builder --chown=qyrobot:qyrobot /app/src/core ./src/core
COPY --from=builder --chown=qyrobot:qyrobot /app/migrations ./migrations
COPY --from=builder --chown=qyrobot:qyrobot /app/configs ./configs

USER qyrobot
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/bootstrap').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npx", "tsx", "server.ts"]
