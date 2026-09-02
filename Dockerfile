# ─── Stage 1 : Builder ───────────────────────────────────────────
# Debian/glibc — better-sqlite3@13 N-API prebuilds target glibc; Alpine/musl
# can load a mismatched binary and fail later with opaque "disk I/O error".
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ARG APP_VERSION=
ARG BUILD_ID=
ARG GIT_COMMIT=
ARG GIT_BRANCH=
ARG BUILD_DATE=

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

RUN npm run build

# ─── Stage 2 : Runner ────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

COPY docker/create-esos-user.sh /tmp/create-esos-user.sh
RUN chmod +x /tmp/create-esos-user.sh && /tmp/create-esos-user.sh && rm /tmp/create-esos-user.sh

COPY --from=builder --chown=esos /app/.output ./

COPY --from=builder --chown=esos /app/package.json ./package.json

COPY --from=builder --chown=esos /app/server/db/migrations ./server/db/migrations

RUN mkdir -p /app/keys /app/data /opt/esos-webui/binaries \
 && chown -R esos:"$(id -g esos)" /app/keys /app/data /opt/esos-webui/binaries

RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu curl \
 && rm -rf /var/lib/apt/lists/*

COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

EXPOSE 3000

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV ESOS_RUNTIME_USER=esos
# Prefer DELETE on first boot after upgrades; WAL can be re-enabled once stable.
ENV DB_JOURNAL_MODE=DELETE

ARG APP_VERSION=
ARG BUILD_ID=
ARG GIT_COMMIT=
ARG GIT_BRANCH=
ARG BUILD_DATE=

LABEL org.opencontainers.image.title="ESOS WebUI"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.description="Read-only SAN visualization for ESOS"

ENV APP_VERSION=${APP_VERSION}
ENV BUILD_ID=${BUILD_ID}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.mjs"]
