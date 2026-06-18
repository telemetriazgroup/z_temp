#!/bin/sh
set -e

export CORREO_DATA_DIR="${CORREO_DATA_DIR:-/app/server/data}"
mkdir -p "$CORREO_DATA_DIR"

node /app/server/emailServer.mjs &
exec nginx -g 'daemon off;'
