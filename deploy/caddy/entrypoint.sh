#!/bin/sh
set -eu

: "${ADMIN_USER:=admin}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${CADDY_SITE_ADDRESS:=:80}"

ADMIN_PASSWORD_HASH="$(caddy hash-password --plaintext "$ADMIN_PASSWORD" | tr -d '\r\n')"
export ADMIN_USER ADMIN_PASSWORD_HASH CADDY_SITE_ADDRESS

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
