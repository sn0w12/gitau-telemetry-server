mod admin;
mod config;
mod error;
mod ingest;
mod rate_limit;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{DefaultBodyLimit, State};
use axum::routing::{get, post};
use axum::Router;
use chrono::Utc;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::net::TcpListener;
use tower_http::compression::CompressionLayer;
use tower_http::decompression::RequestDecompressionLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;
use tracing_subscriber::filter::EnvFilter;

use crate::config::Config;
use crate::error::ApiError;
use crate::rate_limit::RateLimiter;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub rate_limiter: Arc<RateLimiter>,
    pub max_body_bytes: usize,
    pub retention_days: i64,
}

#[tokio::main]
async fn main() {
    init_tracing();

    if let Err(error) = run().await {
        tracing::error!(error = %error, "server stopped");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(config.database.clone())
        .await?;

    if config.migrate_on_start {
        sqlx::migrate!("./migrations").run(&pool).await?;
    }

    spawn_cleanup(pool.clone(), config.retention_days, config.cleanup_interval);

    let state = AppState {
        pool,
        rate_limiter: Arc::new(RateLimiter::new(config.rate_limit_per_minute)),
        max_body_bytes: config.max_body_bytes,
        retention_days: config.retention_days,
    };

    let app = Router::new()
        .route("/healthz", get(health))
        .route("/v1/batches", post(ingest::ingest))
        .route("/v1/admin/overview", get(admin::overview))
        .route("/v1/admin/series", get(admin::series))
        .route("/v1/admin/spans", get(admin::span_summary))
        .route(
            "/v1/admin/spans/{name}/waterfall",
            get(admin::span_waterfall),
        )
        .route("/v1/admin/errors", get(admin::error_summary))
        .route("/v1/admin/traces", get(admin::trace_page))
        .route("/v1/admin/traces/{id}", get(admin::trace_detail))
        .route("/v1/admin/system", get(admin::system_status))
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        .layer(RequestBodyLimitLayer::new(config.max_body_bytes))
        .layer(RequestDecompressionLayer::new())
        .layer(CompressionLayer::new())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(
                    DefaultMakeSpan::new()
                        .include_headers(false)
                        .level(Level::INFO),
                )
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(state);

    let listener = TcpListener::bind(config.bind_addr).await?;
    tracing::info!(address = %config.bind_addr, "telemetry server listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

async fn health(State(state): State<AppState>) -> Result<&'static str, ApiError> {
    sqlx::query("select 1").execute(&state.pool).await?;
    Ok("ok")
}

fn spawn_cleanup(pool: PgPool, retention_days: i64, interval: Duration) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval_at(
            tokio::time::Instant::now() + Duration::from_secs(5),
            interval,
        );
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;
            let cutoff = Utc::now() - chrono::Duration::days(retention_days);
            match sqlx::query("delete from batches where received_at < $1")
                .bind(cutoff)
                .execute(&pool)
                .await
            {
                Ok(result) => {
                    if result.rows_affected() > 0 {
                        tracing::info!(
                            deleted_batches = result.rows_affected(),
                            retention_days,
                            "retention cleanup"
                        );
                    }
                }
                Err(error) => {
                    tracing::error!(%error, "retention cleanup failed");
                }
            }
        }
    });
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to install ctrl-c handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                tracing::error!(%error, "failed to install terminate handler");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("shutdown signal received");
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_current_span(false)
        .init();
}
