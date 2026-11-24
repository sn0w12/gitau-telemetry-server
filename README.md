# gitau telemetry server

Anonymous telemetry ingest and read API for the gitau desktop client.

## Deployment

Deploy `docker-compose.yml` with Docker Compose and set:

| Variable            | Purpose                       |
| ------------------- | ----------------------------- |
| `POSTGRES_PASSWORD` | Database password             |
| `ADMIN_PASSWORD`    | Basic auth password           |
| `ADMIN_USER`        | Optional, defaults to `admin` |

Route the public domain to the `caddy` service on port 80. The Caddy entrypoint
hashes `ADMIN_PASSWORD` at startup. `/` serves the admin UI and `/v1/admin/*`
requires basic auth; `/v1/batches` stays public for ingest. Rebuild the Caddy
image after changing `web/`.

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
```

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
