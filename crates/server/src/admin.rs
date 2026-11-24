use std::collections::{BTreeMap, HashMap};

use axum::extract::{Path, Query, State};
use axum::Json;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use telemetry_protocol::{Span, Trace};
use uuid::Uuid;

use crate::error::ApiError;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct RangeQuery {
    from: Option<String>,
    to: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanQuery {
    from: Option<String>,
    to: Option<String>,
    name: Option<String>,
    version: Option<String>,
    os: Option<String>,
    arch: Option<String>,
    cpu: Option<String>,
    build_profile: Option<String>,
    group_by: Option<String>,
    sort: Option<String>,
    direction: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorQuery {
    from: Option<String>,
    to: Option<String>,
    code: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceQuery {
    from: Option<String>,
    to: Option<String>,
    root: Option<String>,
    version: Option<String>,
    os: Option<String>,
    arch: Option<String>,
    cpu: Option<String>,
    build_profile: Option<String>,
    errors_only: Option<bool>,
    span: Option<String>,
    sort: Option<String>,
    direction: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SeriesQuery {
    from: Option<String>,
    to: Option<String>,
    bucket: Option<String>,
    span: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPoint {
    bucket: DateTime<Utc>,
    traces: i64,
    spans: i64,
    errors: i64,
    avg_us: Option<f64>,
    p95_us: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesResponse {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    bucket: String,
    rows: Vec<SeriesPoint>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    batches: i64,
    traces: i64,
    spans: i64,
    errors: i64,
    error_rate: f64,
    versions: Vec<Bucket>,
    build_profiles: Vec<Bucket>,
    os: Vec<Bucket>,
    arch: Vec<Bucket>,
    cpu_tiers: Vec<Bucket>,
    slowest_traces: Vec<TraceRootBucket>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceRootBucket {
    root: String,
    traces: i64,
    avg_us: f64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Bucket {
    value: String,
    count: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SpanBucket {
    bucket: String,
    calls: i64,
    avg_us: f64,
    p50_us: f64,
    p95_us: f64,
    p99_us: f64,
    max_us: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanSummary {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    group_by: String,
    rows: Vec<SpanBucket>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBucket {
    code: String,
    kind: String,
    count: i64,
    first_seen: DateTime<Utc>,
    last_seen: DateTime<Utc>,
    sample_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorSummary {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    rows: Vec<ErrorBucket>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceRow {
    id: i64,
    batch_id: Uuid,
    root: String,
    received_at: DateTime<Utc>,
    duration_us: i64,
    span_count: i32,
    error_count: i32,
    app_version: String,
    build_profile: String,
    os: String,
    arch: String,
    cpu_tier: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TracePage {
    traces: Vec<TraceRow>,
    total: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceDetail {
    id: i64,
    batch_id: Uuid,
    root: String,
    received_at: DateTime<Utc>,
    duration_us: i64,
    span_count: i32,
    error_count: i32,
    app_version: String,
    build_profile: String,
    os: String,
    arch: String,
    cpu_tier: String,
    tree: serde_json::Value,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    first_batch_at: Option<DateTime<Utc>>,
    last_batch_at: Option<DateTime<Utc>>,
    batches: i64,
    traces: i64,
    spans: i64,
    errors: i64,
    database_bytes: i64,
    server_time: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StorageBucket {
    table: String,
    bytes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResponse {
    #[serde(flatten)]
    status: SystemStatus,
    retention_days: i64,
    storage: Vec<StorageBucket>,
    rate_limit_per_minute: u32,
    max_body_bytes: usize,
}

pub async fn series(
    State(state): State<AppState>,
    Query(query): Query<SeriesQuery>,
) -> Result<Json<SeriesResponse>, ApiError> {
    let (from, to) = parse_range(query.from.as_deref(), query.to.as_deref())?;
    let bucket = query.bucket.as_deref().unwrap_or("hour");
    let (unit, step) = match bucket {
        "minute" => ("minute", "1 minute"),
        "hour" => ("hour", "1 hour"),
        "day" => ("day", "1 day"),
        _ => {
            return Err(ApiError::BadRequest(
                "bucket must be minute, hour, or day".into(),
            ));
        }
    };

    let rows = sqlx::query_as::<_, SeriesPoint>(
        "with bounds as (
            select
                date_trunc($3::text, $1::timestamptz) as start,
                date_trunc($3::text, $2::timestamptz) as finish
        ),
        buckets as (
            select generate_series(start, finish, $4::interval) as bucket
            from bounds
        ),
        trace_counts as (
            select date_trunc($3::text, received_at) as bucket,
                   count(*)::bigint as traces
            from traces
            where received_at >= $1 and received_at < $2
            group by 1
        ),
        span_counts as (
            select date_trunc($3::text, received_at) as bucket,
                   count(*)::bigint as spans,
                   avg(duration_us)::float8 as avg_us,
                   percentile_cont(0.95) within group (order by duration_us) as p95_us
            from spans
            where received_at >= $1 and received_at < $2
              and ($5::text is null or name = $5)
            group by 1
        ),
        error_counts as (
            select date_trunc($3::text, received_at) as bucket,
                   count(*)::bigint as errors
            from errors
            where received_at >= $1 and received_at < $2
            group by 1
        )
        select
            b.bucket,
            coalesce(t.traces, 0)::bigint as traces,
            coalesce(s.spans, 0)::bigint as spans,
            coalesce(e.errors, 0)::bigint as errors,
            s.avg_us,
            s.p95_us
        from buckets b
        left join trace_counts t on t.bucket = b.bucket
        left join span_counts s on s.bucket = b.bucket
        left join error_counts e on e.bucket = b.bucket
        order by b.bucket",
    )
    .bind(from)
    .bind(to)
    .bind(unit)
    .bind(step)
    .bind(query.span.as_deref())
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(SeriesResponse {
        from,
        to,
        bucket: unit.to_owned(),
        rows,
    }))
}

pub async fn overview(
    State(state): State<AppState>,
    Query(query): Query<RangeQuery>,
) -> Result<Json<Overview>, ApiError> {
    let (from, to) = parse_range(query.from.as_deref(), query.to.as_deref())?;

    let (
        batches,
        traces,
        spans,
        errors,
        versions,
        build_profiles,
        os,
        arch,
        cpu_tiers,
        slowest_traces,
    ) = tokio::try_join!(
        count_batches(&state.pool, from, to),
        count_traces(&state.pool, from, to),
        count_spans(&state.pool, from, to),
        count_errors(&state.pool, from, to),
        bucket_traces(&state.pool, from, to, "app_version"),
        bucket_traces(&state.pool, from, to, "build_profile"),
        bucket_traces(&state.pool, from, to, "os"),
        bucket_traces(&state.pool, from, to, "arch"),
        bucket_traces(&state.pool, from, to, "cpu_tier"),
        slowest_trace_roots(&state.pool, from, to, 6),
    )?;

    let error_rate = if traces == 0 {
        0.0
    } else {
        errors as f64 / traces as f64
    };

    Ok(Json(Overview {
        from,
        to,
        batches,
        traces,
        spans,
        errors,
        error_rate,
        versions,
        build_profiles,
        os,
        arch,
        cpu_tiers,
        slowest_traces,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AverageSpan {
    name: String,
    start_us: u64,
    duration_us: u64,
    children: Vec<AverageSpan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AverageWaterfall {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    span: String,
    traces: usize,
    root: AverageSpan,
    duration_us: u64,
}

#[derive(Default)]
struct SpanAccumulator {
    count: u64,
    start_sum: u64,
    duration_sum: u64,
    names: HashMap<String, u64>,
}

fn collect_average(
    span: &Span,
    parent_start: u64,
    path: &mut Vec<usize>,
    aggregates: &mut BTreeMap<Vec<usize>, SpanAccumulator>,
) {
    let entry = aggregates.entry(path.clone()).or_default();
    entry.count += 1;
    entry.start_sum += span.start_us.saturating_sub(parent_start);
    entry.duration_sum += span.duration_us;
    *entry.names.entry(span.name.clone()).or_default() += 1;

    for (index, child) in span.children.iter().enumerate() {
        path.push(index);
        collect_average(child, span.start_us, path, aggregates);
        path.pop();
    }
}

fn build_average(
    path: &[usize],
    parent_start: u64,
    aggregates: &BTreeMap<Vec<usize>, SpanAccumulator>,
) -> AverageSpan {
    let entry = aggregates
        .get(path)
        .expect("aggregate path exists while building waterfall");
    let name = entry
        .names
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(name, _)| name.clone())
        .unwrap_or_default();
    let start_us = parent_start.saturating_add(entry.start_sum / entry.count);
    let children = aggregates
        .keys()
        .filter(|candidate| candidate.len() == path.len() + 1 && candidate.starts_with(path))
        .map(|child| build_average(child, start_us, aggregates))
        .collect();

    AverageSpan {
        name,
        start_us,
        duration_us: entry.duration_sum / entry.count,
        children,
    }
}

pub async fn span_waterfall(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(query): Query<RangeQuery>,
) -> Result<Json<AverageWaterfall>, ApiError> {
    let (from, to) = parse_range(query.from.as_deref(), query.to.as_deref())?;

    let trees = sqlx::query_scalar::<_, serde_json::Value>(
        "select b.payload -> 'traces' -> t.trace_index
         from traces t
         join batches b on b.id = t.batch_id
         where t.received_at >= $1 and t.received_at < $2
           and exists (
               select 1 from spans s
               where s.trace_id = t.id and s.name = $3
           )
         order by t.id desc
         limit 500",
    )
    .bind(from)
    .bind(to)
    .bind(&name)
    .fetch_all(&state.pool)
    .await?;

    let mut roots: HashMap<String, Vec<Span>> = HashMap::new();
    for tree in trees {
        let trace: Trace =
            serde_json::from_value(tree).map_err(|error| ApiError::Internal(error.to_string()))?;
        let span = trace.root;
        roots.entry(span.name.clone()).or_default().push(span);
    }

    let (_, spans) = roots
        .into_iter()
        .max_by_key(|(_, spans)| spans.len())
        .ok_or(ApiError::NotFound)?;

    let mut aggregates = BTreeMap::new();
    let mut path = Vec::new();
    for span in &spans {
        collect_average(span, span.start_us, &mut path, &mut aggregates);
        path.clear();
    }

    let root = build_average(&[], 0, &aggregates);
    let duration_us = root.duration_us;

    Ok(Json(AverageWaterfall {
        from,
        to,
        span: name,
        traces: spans.len(),
        root,
        duration_us,
    }))
}

pub async fn span_summary(
    State(state): State<AppState>,
    Query(query): Query<SpanQuery>,
) -> Result<Json<SpanSummary>, ApiError> {
    let (from, to) = parse_range(query.from.as_deref(), query.to.as_deref())?;
    let group_by = query.group_by.as_deref().unwrap_or("name");
    let group_expression = match group_by {
        "name" => "s.name",
        "version" => "t.app_version",
        "os" => "t.os",
        "arch" => "t.arch",
        "cpu" => "t.cpu_tier",
        "build_profile" => "t.build_profile",
        _ => {
            return Err(ApiError::BadRequest(
                "group_by must be name, version, os, arch, cpu, or build_profile".into(),
            ));
        }
    };

    let sort = query.sort.as_deref().unwrap_or("calls");
    let order_expression = match sort {
        "name" => "bucket",
        "calls" => "calls",
        "avg" => "avg_us",
        "p50" => "p50_us",
        "p95" => "p95_us",
        "p99" => "p99_us",
        "max" => "max_us",
        _ => {
            return Err(ApiError::BadRequest(
                "sort must be name, calls, avg, p50, p95, p99, or max".into(),
            ));
        }
    };
    let direction = match query.direction.as_deref().unwrap_or("desc") {
        "asc" => "asc",
        "desc" => "desc",
        _ => {
            return Err(ApiError::BadRequest("direction must be asc or desc".into()));
        }
    };

    let sql = format!(
        "select
            {group_expression} as bucket,
            count(*)::bigint as calls,
            coalesce(avg(s.duration_us), 0)::float8 as avg_us,
            coalesce(percentile_cont(0.5) within group (order by s.duration_us), 0)::float8 as p50_us,
            coalesce(percentile_cont(0.95) within group (order by s.duration_us), 0)::float8 as p95_us,
            coalesce(percentile_cont(0.99) within group (order by s.duration_us), 0)::float8 as p99_us,
            coalesce(max(s.duration_us), 0)::bigint as max_us
         from spans s
         join traces t on t.id = s.trace_id
         where s.received_at >= $1 and s.received_at < $2
           and ($3::text is null or s.name ilike '%' || $3 || '%')
           and ($4::text is null or t.app_version ilike '%' || $4 || '%')
           and ($5::text is null or t.os = $5)
           and ($6::text is null or t.arch = $6)
           and ($7::text is null or t.cpu_tier = $7)
           and ($8::text is null or t.build_profile = $8)
         group by 1
         order by {order_expression} {direction}, bucket
         limit 200"
    );

    let rows = sqlx::query_as::<_, SpanBucket>(&sql)
        .bind(from)
        .bind(to)
        .bind(query.name.as_deref())
        .bind(query.version.as_deref())
        .bind(query.os.as_deref())
        .bind(query.arch.as_deref())
        .bind(query.cpu.as_deref())
        .bind(query.build_profile.as_deref())
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(SpanSummary {
        from,
        to,
        group_by: group_by.to_owned(),
        rows,
    }))
}

pub async fn error_summary(
    State(state): State<AppState>,
    Query(query): Query<ErrorQuery>,
) -> Result<Json<ErrorSummary>, ApiError> {
    let (from, to) = parse_range(query.from.as_deref(), query.to.as_deref())?;

    let rows = sqlx::query_as::<_, ErrorBucket>(
        "select
            e.code,
            e.kind,
            count(*)::bigint as count,
            min(e.received_at) as first_seen,
            max(e.received_at) as last_seen,
            (array_agg(e.message order by e.received_at desc)
                filter (where e.message is not null))[1] as sample_message
         from errors e
         where e.received_at >= $1 and e.received_at < $2
           and ($3::text is null or e.code = $3)
           and ($4::text is null or e.app_version = $4)
         group by e.code, e.kind
         order by count desc
         limit 200",
    )
    .bind(from)
    .bind(to)
    .bind(query.code.as_deref())
    .bind(query.version.as_deref())
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(ErrorSummary { from, to, rows }))
}

pub async fn trace_page(
    State(state): State<AppState>,
    Query(query): Query<TraceQuery>,
) -> Result<Json<TracePage>, ApiError> {
    let (from, to) = parse_range(query.from.as_deref(), query.to.as_deref())?;
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let offset = query.offset.unwrap_or(0).max(0);

    let sort = query.sort.as_deref().unwrap_or("received");
    let order_expression = match sort {
        "root" => "root",
        "received" => "received_at",
        "duration" => "duration_us",
        "spans" => "span_count",
        "errors" => "error_count",
        "version" => "app_version",
        _ => {
            return Err(ApiError::BadRequest(
                "sort must be root, received, duration, spans, errors, or version".into(),
            ));
        }
    };
    let direction = match query.direction.as_deref().unwrap_or("desc") {
        "asc" => "asc",
        "desc" => "desc",
        _ => {
            return Err(ApiError::BadRequest("direction must be asc or desc".into()));
        }
    };

    let sql = format!(
        "select
            id, batch_id, root, received_at, duration_us, span_count, error_count,
            app_version, build_profile, os, arch, cpu_tier
         from traces
         where received_at >= $1 and received_at < $2
           and ($3::text is null or root ilike '%' || $3 || '%')
           and ($4::text is null or app_version ilike '%' || $4 || '%')
           and ($5::text is null or os = $5)
           and ($6::text is null or arch = $6)
           and ($7::text is null or cpu_tier = $7)
           and ($8::text is null or build_profile = $8)
           and ($9::bool is null or (error_count > 0) = $9)
           and ($10::text is null or exists (
               select 1 from spans s
               where s.trace_id = traces.id and s.name = $10
           ))
         order by {order_expression} {direction}, id desc
         limit $11 offset $12"
    );

    let traces = sqlx::query_as::<_, TraceRow>(&sql)
        .bind(from)
        .bind(to)
        .bind(query.root.as_deref())
        .bind(query.version.as_deref())
        .bind(query.os.as_deref())
        .bind(query.arch.as_deref())
        .bind(query.cpu.as_deref())
        .bind(query.build_profile.as_deref())
        .bind(query.errors_only)
        .bind(query.span.as_deref())
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?;

    let total = sqlx::query_scalar::<_, i64>(
        "select count(*) from traces
         where received_at >= $1 and received_at < $2
           and ($3::text is null or root ilike '%' || $3 || '%')
           and ($4::text is null or app_version ilike '%' || $4 || '%')
           and ($5::text is null or os = $5)
           and ($6::text is null or arch = $6)
           and ($7::text is null or cpu_tier = $7)
           and ($8::text is null or build_profile = $8)
           and ($9::bool is null or (error_count > 0) = $9)
           and ($10::text is null or exists (
               select 1 from spans s
               where s.trace_id = traces.id and s.name = $10
           ))",
    )
    .bind(from)
    .bind(to)
    .bind(query.root.as_deref())
    .bind(query.version.as_deref())
    .bind(query.os.as_deref())
    .bind(query.arch.as_deref())
    .bind(query.cpu.as_deref())
    .bind(query.build_profile.as_deref())
    .bind(query.errors_only)
    .bind(query.span.as_deref())
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(TracePage { traces, total }))
}

pub async fn trace_detail(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<TraceDetail>, ApiError> {
    let detail = sqlx::query_as::<_, TraceDetail>(
        "select
            t.id, t.batch_id, t.root, t.received_at, t.duration_us,
            t.span_count, t.error_count, t.app_version, t.build_profile,
            t.os, t.arch, t.cpu_tier,
            b.payload -> 'traces' -> t.trace_index as tree
         from traces t
         join batches b on b.id = t.batch_id
         where t.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    detail.map(Json).ok_or(ApiError::NotFound)
}

pub async fn system_status(
    State(state): State<AppState>,
) -> Result<Json<SystemResponse>, ApiError> {
    let status = sqlx::query_as::<_, SystemStatus>(
        "select
            (select min(received_at) from batches) as first_batch_at,
            (select max(received_at) from batches) as last_batch_at,
            (select count(*) from batches) as batches,
            (select count(*) from traces) as traces,
            (select count(*) from spans) as spans,
            (select count(*) from errors) as errors,
            pg_database_size(current_database()) as database_bytes,
            now() as server_time",
    )
    .fetch_one(&state.pool)
    .await?;

    let storage = sqlx::query_as::<_, StorageBucket>(
        "select relname as table, pg_total_relation_size(c.oid)::bigint as bytes
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and relname in ('batches', 'traces', 'spans', 'errors')
         order by bytes desc",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(SystemResponse {
        status,
        retention_days: state.retention_days,
        storage,
        rate_limit_per_minute: state.rate_limiter.limit(),
        max_body_bytes: state.max_body_bytes,
    }))
}

async fn count_batches(
    pool: &sqlx::PgPool,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("select count(*) from batches where received_at >= $1 and received_at < $2")
        .bind(from)
        .bind(to)
        .fetch_one(pool)
        .await
}

async fn count_traces(
    pool: &sqlx::PgPool,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("select count(*) from traces where received_at >= $1 and received_at < $2")
        .bind(from)
        .bind(to)
        .fetch_one(pool)
        .await
}

async fn count_spans(
    pool: &sqlx::PgPool,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("select count(*) from spans where received_at >= $1 and received_at < $2")
        .bind(from)
        .bind(to)
        .fetch_one(pool)
        .await
}

async fn count_errors(
    pool: &sqlx::PgPool,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("select count(*) from errors where received_at >= $1 and received_at < $2")
        .bind(from)
        .bind(to)
        .fetch_one(pool)
        .await
}

async fn slowest_trace_roots(
    pool: &sqlx::PgPool,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    limit: i64,
) -> Result<Vec<TraceRootBucket>, sqlx::Error> {
    sqlx::query_as::<_, TraceRootBucket>(
        "select
            root,
            count(*)::bigint as traces,
            coalesce(avg(duration_us), 0)::float8 as avg_us
         from traces
         where received_at >= $1 and received_at < $2
         group by root
         order by avg_us desc, root
         limit $3",
    )
    .bind(from)
    .bind(to)
    .bind(limit)
    .fetch_all(pool)
    .await
}

async fn bucket_traces(
    pool: &sqlx::PgPool,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    column: &str,
) -> Result<Vec<Bucket>, sqlx::Error> {
    let expression = match column {
        "app_version" => "app_version",
        "build_profile" => "build_profile",
        "os" => "os",
        "arch" => "arch",
        "cpu_tier" => "cpu_tier",
        _ => return Ok(Vec::new()),
    };
    let sql = format!(
        "select {expression} as value, count(*)::bigint as count
         from traces
         where received_at >= $1 and received_at < $2
         group by 1
         order by count desc
         limit 20"
    );
    sqlx::query_as::<_, Bucket>(&sql)
        .bind(from)
        .bind(to)
        .fetch_all(pool)
        .await
}

fn parse_range(
    from: Option<&str>,
    to: Option<&str>,
) -> Result<(DateTime<Utc>, DateTime<Utc>), ApiError> {
    let to = match to.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => parse_time(value)?,
        None => Utc::now(),
    };
    let from = match from.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => parse_time(value)?,
        None => to - Duration::hours(24),
    };

    if from >= to {
        return Err(ApiError::BadRequest("from must be before to".into()));
    }
    if to - from > Duration::days(90) {
        return Err(ApiError::BadRequest(
            "time range cannot exceed 90 days".into(),
        ));
    }

    Ok((from, to))
}

fn parse_time(value: &str) -> Result<DateTime<Utc>, ApiError> {
    if let Ok(millis) = value.parse::<i64>() {
        return DateTime::<Utc>::from_timestamp_millis(millis)
            .ok_or_else(|| ApiError::BadRequest(format!("invalid timestamp `{value}`")));
    }

    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(|_| ApiError::BadRequest(format!("invalid timestamp `{value}`")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_unix_milliseconds() {
        let parsed = parse_time("1700000000000").unwrap();
        assert_eq!(parsed.timestamp_millis(), 1_700_000_000_000);
    }

    #[test]
    fn parses_rfc3339() {
        let parsed = parse_time("2026-01-01T00:00:00Z").unwrap();
        assert_eq!(parsed.timestamp(), 1_767_225_600);
    }

    #[test]
    fn rejects_ranges_longer_than_ninety_days() {
        let error = parse_range(Some("2025-01-01T00:00:00Z"), Some("2026-01-01T00:00:00Z"));
        assert!(error.is_err());
    }
}
