#!/bin/sh
set -eu

if [ -z "${ADMIN_PASSWORD_HASH:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
	ADMIN_PASSWORD_HASH="$(HASH_PASSWORD=1 /usr/local/bin/telemetry-server)"
	export ADMIN_PASSWORD_HASH
fi

unset ADMIN_PASSWORD

exec /usr/local/bin/telemetry-server "$@"
