#!/bin/sh
set -e

node /app/server/emailServer.mjs &
exec nginx -g 'daemon off;'
