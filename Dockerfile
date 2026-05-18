# ─── Stage 1 : Builder ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build-time version metadata (injected by CI or docker build --build-arg).
# Leave APP_VERSION empty for release images to use package.json at runtime.
ARG APP_VERSION=
ARG BUILD_ID=
ARG GIT_COMMIT=
ARG GIT_BRANCH=
ARG BUILD_DATE=

# System deps required by ssh2 (optional native bindings)
RUN apk add --no-cache python3 make g++

# Manifests first for Docker layer caching
COPY package.json package-lock.json* ./

# Full install (dev deps included for the build)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the source
COPY . .

# Build Nuxt → .output/
RUN npm run build

# ─── Stage 2 : Runner ────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Non-root user
RUN addgroup -S esos && adduser -S esos -G esos

# Copy only the Nuxt build output
COPY --from=builder --chown=esos:esos /app/.output ./

# Keep package metadata for Dependency Tracker in runtime container
COPY --from=builder --chown=esos:esos /app/package.json ./package.json

# Copy DB migrations (read at runtime by drizzle migrate())
COPY --from=builder --chown=esos:esos /app/server/db/migrations ./server/db/migrations

# Mount point for the SSH key (filled by docker-compose volume)
RUN mkdir -p /app/keys && chown esos:esos /app/keys

# Mount point for the SQLite database (filled by docker-compose volume db-data)
RUN mkdir -p /app/data && chown esos:esos /app/data

USER esos

EXPOSE 3000

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

# Re-declare per stage (ARG does not carry across FROM) — must match builder defaults
ARG APP_VERSION=
ARG BUILD_ID=
ARG GIT_COMMIT=
ARG GIT_BRANCH=
ARG BUILD_DATE=

LABEL org.opencontainers.image.title="ESOS WebUI"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.description="Read-only SAN visualization for ESOS"

# Version metadata — baked in at build time, overridable at runtime
ENV APP_VERSION=${APP_VERSION}
ENV BUILD_ID=${BUILD_ID}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.mjs"]
