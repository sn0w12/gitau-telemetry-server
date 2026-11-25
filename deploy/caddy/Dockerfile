FROM node:22-alpine AS ui
WORKDIR /ui
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=ui /ui/dist /srv/admin
COPY deploy/Caddyfile /etc/caddy/Caddyfile
