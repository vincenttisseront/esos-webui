#!/bin/sh
# Fix ownership on mounted volumes before dropping to the esos runtime user.
# The HTTP server listens on loopback only. This wins over env_file / NITRO_HOST.
set -e

export NITRO_HOST=127.0.0.1
export HOST=127.0.0.1

if id esos >/dev/null 2>&1; then
  ESOS_UID=$(id -u esos)
  ESOS_GID=$(id -g esos)
else
  ESOS_UID="${ESOS_RUNTIME_UID:-1000}"
  ESOS_GID="${ESOS_RUNTIME_GID:-1000}"
fi

mkdir -p /opt/esos-webui/binaries /app/data /app/keys

if [ "$(id -u)" = "0" ]; then
  chown -R "${ESOS_UID}:${ESOS_GID}" /opt/esos-webui/binaries /app/data 2>/dev/null || true
  chmod 775 /opt/esos-webui/binaries 2>/dev/null || true
  if command -v gosu >/dev/null 2>&1; then
    exec gosu esos "$@"
  fi
  if command -v su-exec >/dev/null 2>&1; then
    exec su-exec esos "$@"
  fi
  exec runuser -u esos -- "$@"
fi

exec "$@"
