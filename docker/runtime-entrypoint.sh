#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/runtime /app/.angee/data
  chown -R angee:angee /app/runtime
  chown angee:angee /app/.angee/data
  find /app/.angee/data -mindepth 1 -maxdepth 1 ! -name pgdata -exec chown -R angee:angee {} +
  exec gosu angee "$@"
fi

exec "$@"
