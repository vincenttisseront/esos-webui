#!/bin/sh
# Create runtime user "esos" with UID/GID 1000 when available (Debian / Alpine).
set -eux

if getent group 1000 >/dev/null 2>&1; then
  ESOS_GROUP=$(getent group 1000 | cut -d: -f1)
elif command -v addgroup >/dev/null 2>&1 && ! command -v groupadd >/dev/null 2>&1; then
  addgroup -g 1000 -S esos
  ESOS_GROUP=esos
else
  groupadd -g 1000 esos
  ESOS_GROUP=esos
fi

if getent passwd esos >/dev/null 2>&1; then
  echo "esos user exists (uid=$(id -u esos) gid=$(id -g esos) group=${ESOS_GROUP})"
  exit 0
fi

if command -v adduser >/dev/null 2>&1 && ! command -v useradd >/dev/null 2>&1; then
  # Alpine busybox
  if getent passwd 1000 >/dev/null 2>&1; then
    adduser -S -G "$ESOS_GROUP" -D esos
  else
    adduser -u 1000 -S -G "$ESOS_GROUP" -D esos
  fi
else
  # Debian
  if getent passwd 1000 >/dev/null 2>&1; then
    useradd -g "$ESOS_GROUP" -M -r -s /usr/sbin/nologin esos
  else
    useradd -u 1000 -g "$ESOS_GROUP" -M -r -s /usr/sbin/nologin esos
  fi
fi

echo "created esos (uid=$(id -u esos) gid=$(id -g esos) group=${ESOS_GROUP})"
