#!/bin/sh
set -eu

: "${ADMIN_USER:=admin}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${CADDY_SITE_ADDRESS:=:80}"

# An empty token would match "Bearer ", so use one nobody knows when unset.
if [ -z "${API_TOKEN:-}" ]; then
	API_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '\r\n')"
fi

case "$API_TOKEN" in
*[!A-Za-z0-9._~+/=-]*)
	echo "API_TOKEN contains characters outside A-Z a-z 0-9 . _ ~ + / = -" >&2
	exit 1
	;;
esac

ADMIN_PASSWORD_HASH="$(caddy hash-password --plaintext "$ADMIN_PASSWORD" | tr -d '\r\n')"
export ADMIN_USER ADMIN_PASSWORD_HASH CADDY_SITE_ADDRESS API_TOKEN

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
