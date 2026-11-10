#!/bin/sh
# Starts as root only to fix the data dir owner (older versions created volumes as
# root), then drops privileges. With `user:` in compose (or `docker run --user`) the
# container starts unprivileged and this step is skipped.
set -eu

if [ "$(id -u)" = "0" ]; then
  uid="${PUID:-10001}"
  gid="${PGID:-10001}"
  data="${NOTIFLY_DATA_DIR:-/data}"
  mkdir -p "$data"
  find "$data" \( \! -user "$uid" -o \! -group "$gid" \) -exec chown "$uid:$gid" {} +
  export HOME=/tmp
  exec setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$@"
fi

exec "$@"
