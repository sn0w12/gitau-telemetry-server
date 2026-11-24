FROM caddy:2.10-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY web /srv/admin
COPY deploy/caddy/entrypoint.sh /usr/local/bin/telemetry-caddy
RUN chmod +x /usr/local/bin/telemetry-caddy

ENTRYPOINT ["/usr/local/bin/telemetry-caddy"]
