#!/bin/sh
set -e

export TZ="${TZ:-America/Lima}"
export CORREO_DATA_DIR="${CORREO_DATA_DIR:-/app/server/data}"
export DATABASE_URL="${DATABASE_URL:-postgresql://ztrack:ztrack@postgres:5432/ztrack_analisis}"
mkdir -p "$CORREO_DATA_DIR"

node /app/server/emailServer.mjs &
exec nginx -g 'daemon off;'
