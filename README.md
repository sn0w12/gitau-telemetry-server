# gitau telemetry server

Anonymous telemetry ingest and read API for the gitau desktop client.

## Deployment

Deploy `docker-compose.yml` with Docker Compose and set:

| Variable                | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `POSTGRES_PASSWORD`     | Database password                                                 |
| `ADMIN_PASSWORD`        | Admin dashboard and API password                                  |
| `ADMIN_USER`            | Optional, defaults to `admin`                                     |
| `API_TOKEN`             | Optional bearer token for `/v1/admin/*`; empty disables it        |
| `CADDY_PORT`            | Optional host port, defaults to `80`                              |
| `ALLOW_DEBUG_TELEMETRY` | Optional, accepts debug builds when `1` or `true`; off by default |
| `LOG_FORMAT`            | Optional, `text` (default) or `json` for log collectors           |

Route the public domain to the `caddy` service on port 80. `/login` serves the
login page, `/` and the other UI routes require a session cookie, and
`/v1/admin/*` accepts that cookie or `Authorization: Bearer $API_TOKEN`.
`/v1/batches` stays public for ingest. Rebuild the Caddy image after changing
`web/`.

The server image hashes `ADMIN_PASSWORD` with Argon2id in its entrypoint, then
unsets the plaintext before starting the server. The server process only sees
the hash. On a non-loopback `BIND_ADDR` it refuses to start without one, which
the entrypoint supplies automatically. Local development on `127.0.0.1` can run
without a password.

## Local development

```bash
docker run --rm -d --name telemetry-db \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=telemetry \
  -p 127.0.0.1:15432:5432 \
  postgres:17-alpine
```

```bash
export PGHOST=127.0.0.1 PGPORT=15432 PGUSER=postgres PGPASSWORD=test PGDATABASE=telemetry
export BIND_ADDR=127.0.0.1:18080
export ALLOW_DEBUG_TELEMETRY=1
cargo run -p telemetry-server
```

`DATABASE_URL` can replace the `PG*` variables.

Run the UI in a second terminal:

```bash
cd web
npm install
npm run dev
```

The UI is served at `http://localhost:3001` and proxies `/v1` to port 18080.

```bash
curl -i -X POST http://127.0.0.1:18080/v1/batches \
  -H 'Content-Type: application/json' \
  --data-binary @fixtures/sample-batch.json
```

## API

```text
POST /v1/batches
GET  /v1/admin/{overview,series,spans,errors,traces,system}
GET  /v1/admin/traces/{id}
GET  /healthz
POST /auth/login
POST /logout
GET  /auth/verify
```

`POST /v1/batches` returns 400 for batches whose `buildProfile` is `debug` or
`dev` unless `ALLOW_DEBUG_TELEMETRY` is enabled.

Admin endpoints accept the session cookie from the login page or a bearer
token:

```bash
curl -H "Authorization: Bearer $API_TOKEN" \
  'https://telemetry.example.com/v1/admin/overview'
```

`POST /logout` clears the session cookie. Sessions live in server memory and
expire after seven days, so a restart signs everyone out.

## Checks

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

cd web
npm run format:check
npm run lint
npm run typecheck
```
