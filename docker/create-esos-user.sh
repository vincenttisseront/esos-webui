#!/bin/sh
# Alpine node images often ship with GID 1000 as "users". Reuse it; create esos with UID 1000 when free.
set -eux

if getent group 1000 >/dev/null 2>&1; then
  ESOS_GROUP=$(getent group 1000 | cut -d: -f1)
else
  addgroup -g 1000 -S esos
  ESOS_GROUP=esos
fi

if getent passwd esos >/dev/null 2>&1; then
  echo "esos user exists (uid=$(id -u esos) gid=$(id -g esos) group=${ESOS_GROUP})"
  exit 0
fi

if getent passwd 1000 >/dev/null 2>&1; then
  adduser -S -G "$ESOS_GROUP" -D esos
else
  adduser -u 1000 -S -G "$ESOS_GROUP" -D esos
fi

echo "created esos (uid=$(id -u esos) gid=$(id -g esos) group=${ESOS_GROUP})"
