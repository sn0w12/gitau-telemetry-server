# Privacy notes

This service receives anonymous telemetry from the gitau desktop app. It is
meant to run in the EU on infrastructure controlled by the operator.

## What is stored

- Span names, start offsets, durations, and parent paths.
- Attributes the client attached with `telemetry::context!`.
- Error codes, error type names, and sanitized messages where the client opted
  into detail.
- App version, build profile, OS family, architecture, and CPU tier bucket.
- Server receive time.
- The raw batch JSON, which contains the same fields.

## What is not stored

- Client IP addresses, User-Agent strings, cookies, or TLS fingerprints.
- Accounts, device identifiers, install identifiers, or session identifiers.
- Repository paths, branch names, diffs, commit hashes, or environment
  variables. The client never sends them.
- Anything that links one batch to another.

## IP handling

The ingest handler reads the client address to rate limit requests. The address
lives only in an in-memory map with a two-minute window and is never logged or
written to Postgres. Caddy passes the direct client address through
`X-Forwarded-For` and does not enable access logs.

## Retention

`RETENTION_DAYS` defaults to 90. A background task deletes older batches, and
traces, spans, and errors cascade. Backups inherit the same data and should be
kept no longer than the retention window unless a longer period is justified.

## Deletion and access requests

The service has no user identifiers, so it cannot locate data for a specific
person. There is no per-user deletion path.
