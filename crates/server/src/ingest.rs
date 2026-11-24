use std::net::{IpAddr, SocketAddr};

use axum::body::Bytes;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use telemetry_protocol::{Batch, Span};
use uuid::Uuid;

use crate::error::ApiError;
use crate::AppState;

#[derive(Debug, Default)]
struct IngestSummary {
    traces: usize,
    spans: usize,
    errors: usize,
}

struct FlatSpan {
    path: String,
    name: String,
    depth: i32,
    start_us: i64,
    duration_us: i64,
    attributes: Value,
    error_code: Option<String>,
    error_kind: Option<String>,
}

struct FlatError {
    span_path: Option<String>,
    code: String,
    kind: String,
    message: Option<String>,
    sources: Value,
}

pub async fn ingest(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let ip = client_ip(&headers, peer.ip());
    if !state.rate_limiter.check(ip) {
        return Err(ApiError::RateLimited);
    }
    if body.len() > state.max_body_bytes {
        return Err(ApiError::PayloadTooLarge);
    }

    let batch: Batch = serde_json::from_slice(&body)
        .map_err(|error| ApiError::BadRequest(format!("invalid JSON: {error}")))?;
    batch.validate()?;

    let payload =
        serde_json::to_value(&batch).map_err(|error| ApiError::Internal(error.to_string()))?;
    let batch_id = Uuid::now_v7();
    let received_at = Utc::now();
    let summary = store_batch(&state.pool, batch_id, received_at, &batch, payload).await?;

    tracing::info!(
        batch_id = %batch_id,
        traces = summary.traces,
        spans = summary.spans,
        errors = summary.errors,
        bytes = body.len(),
        "ingested batch"
    );

    Ok(StatusCode::ACCEPTED)
}

async fn store_batch(
    pool: &PgPool,
    batch_id: Uuid,
    received_at: DateTime<Utc>,
    batch: &Batch,
    payload: Value,
) -> Result<IngestSummary, ApiError> {
    let mut transaction = pool.begin().await?;

    sqlx::query(
        "insert into batches (
            id, received_at, schema_version, app_version, build_profile,
            os, arch, cpu_tier, dropped_traces, payload
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(batch_id)
    .bind(received_at)
    .bind(batch.schema_version as i32)
    .bind(&batch.context.app_version)
    .bind(&batch.context.build_profile)
    .bind(&batch.context.os)
    .bind(&batch.context.arch)
    .bind(&batch.context.cpu_tier)
    .bind(i64::try_from(batch.dropped_traces).unwrap_or(i64::MAX))
    .bind(&payload)
    .execute(&mut *transaction)
    .await?;

    let mut total_spans = 0usize;
    let mut total_errors = 0usize;

    for (trace_index, trace) in batch.traces.iter().enumerate() {
        let mut spans = Vec::new();
        let mut errors = Vec::new();
        flatten_span(&trace.root, "0", 0, &mut spans, &mut errors);

        let trace_id: i64 = sqlx::query_scalar(
            "insert into traces (
                batch_id, trace_index, root, received_at, duration_us,
                span_count, error_count, app_version, build_profile,
                os, arch, cpu_tier
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             returning id",
        )
        .bind(batch_id)
        .bind(trace_index as i32)
        .bind(&trace.root.name)
        .bind(received_at)
        .bind(i64::try_from(trace.duration_us).unwrap_or(i64::MAX))
        .bind(spans.len() as i32)
        .bind(errors.len() as i32)
        .bind(&batch.context.app_version)
        .bind(&batch.context.build_profile)
        .bind(&batch.context.os)
        .bind(&batch.context.arch)
        .bind(&batch.context.cpu_tier)
        .fetch_one(&mut *transaction)
        .await?;

        insert_spans(&mut transaction, trace_id, received_at, &spans).await?;
        insert_errors(
            &mut transaction,
            batch_id,
            Some(trace_id),
            received_at,
            &batch.context.app_version,
            &errors,
        )
        .await?;

        total_spans += spans.len();
        total_errors += errors.len();
    }

    let standalone = batch
        .errors
        .iter()
        .map(|error| FlatError {
            span_path: None,
            code: error.code.clone(),
            kind: error.kind.clone(),
            message: error.message.clone(),
            sources: serde_json::to_value(&error.sources).unwrap_or_else(|_| json!([])),
        })
        .collect::<Vec<_>>();

    if !standalone.is_empty() {
        insert_errors(
            &mut transaction,
            batch_id,
            None,
            received_at,
            &batch.context.app_version,
            &standalone,
        )
        .await?;
        total_errors += standalone.len();
    }

    transaction.commit().await?;

    Ok(IngestSummary {
        traces: batch.traces.len(),
        spans: total_spans,
        errors: total_errors,
    })
}

fn flatten_span(
    span: &Span,
    path: &str,
    depth: usize,
    spans: &mut Vec<FlatSpan>,
    errors: &mut Vec<FlatError>,
) {
    let error = span.error.as_ref();
    spans.push(FlatSpan {
        path: path.to_owned(),
        name: span.name.clone(),
        depth: depth as i32,
        start_us: i64::try_from(span.start_us).unwrap_or(i64::MAX),
        duration_us: i64::try_from(span.duration_us).unwrap_or(i64::MAX),
        attributes: serde_json::to_value(&span.attributes).unwrap_or_else(|_| json!({})),
        error_code: error.map(|error| error.code.clone()),
        error_kind: error.map(|error| error.kind.clone()),
    });

    if let Some(error) = error {
        errors.push(FlatError {
            span_path: Some(path.to_owned()),
            code: error.code.clone(),
            kind: error.kind.clone(),
            message: error.message.clone(),
            sources: serde_json::to_value(&error.sources).unwrap_or_else(|_| json!([])),
        });
    }

    for (index, child) in span.children.iter().enumerate() {
        let child_path = format!("{path}.{index}");
        flatten_span(child, &child_path, depth + 1, spans, errors);
    }
}

async fn insert_spans(
    transaction: &mut Transaction<'_, Postgres>,
    trace_id: i64,
    received_at: DateTime<Utc>,
    spans: &[FlatSpan],
) -> Result<(), sqlx::Error> {
    const CHUNK: usize = 500;

    for chunk in spans.chunks(CHUNK) {
        let mut builder = QueryBuilder::<Postgres>::new(
            "insert into spans (
                trace_id, path, name, depth, start_us, duration_us,
                attributes, error_code, error_kind, received_at
             ) ",
        );
        builder.push_values(chunk, |mut row, span| {
            row.push_bind(trace_id)
                .push_bind(&span.path)
                .push_bind(&span.name)
                .push_bind(span.depth)
                .push_bind(span.start_us)
                .push_bind(span.duration_us)
                .push_bind(&span.attributes)
                .push_bind(&span.error_code)
                .push_bind(&span.error_kind)
                .push_bind(received_at);
        });
        builder.build().execute(&mut **transaction).await?;
    }

    Ok(())
}

async fn insert_errors(
    transaction: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
    trace_id: Option<i64>,
    received_at: DateTime<Utc>,
    app_version: &str,
    errors: &[FlatError],
) -> Result<(), sqlx::Error> {
    const CHUNK: usize = 500;

    for chunk in errors.chunks(CHUNK) {
        let mut builder = QueryBuilder::<Postgres>::new(
            "insert into errors (
                batch_id, trace_id, span_path, code, kind, message,
                sources, app_version, received_at
             ) ",
        );
        builder.push_values(chunk, |mut row, error| {
            row.push_bind(batch_id)
                .push_bind(trace_id)
                .push_bind(&error.span_path)
                .push_bind(&error.code)
                .push_bind(&error.kind)
                .push_bind(&error.message)
                .push_bind(&error.sources)
                .push_bind(app_version)
                .push_bind(received_at);
        });
        builder.build().execute(&mut **transaction).await?;
    }

    Ok(())
}

fn client_ip(headers: &HeaderMap, peer: IpAddr) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(peer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_the_peer_address() {
        let headers = HeaderMap::new();
        let peer: IpAddr = "203.0.113.7".parse().unwrap();
        assert_eq!(client_ip(&headers, peer), peer);
    }

    #[test]
    fn uses_the_first_forwarded_address() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "198.51.100.4, 10.0.0.2".parse().unwrap());
        let peer: IpAddr = "203.0.113.7".parse().unwrap();
        assert_eq!(
            client_ip(&headers, peer),
            "198.51.100.4".parse::<IpAddr>().unwrap()
        );
    }
}
