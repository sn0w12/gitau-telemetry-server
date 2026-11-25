mod admin;
mod auth;
mod config;
mod error;
mod ingest;
mod rate_limit;

use std::io::IsTerminal;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{DefaultBodyLimit, Request, State};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use chrono::Utc;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::net::TcpListener;
use tower_http::compression::CompressionLayer;
use tower_http::decompression::RequestDecompressionLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tracing::Instrument;
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
    pub allow_debug_telemetry: bool,
    pub auth: Option<Arc<auth::Auth>>,
}

#[tokio::main]
async fn main() {
    // The container entrypoint uses this mode to hash ADMIN_PASSWORD before exec.
    if std::env::var_os("HASH_PASSWORD").is_some() {
        if let Err(error) = print_password_hash() {
            eprintln!("hash password: {error}");
            std::process::exit(1);
        }
        return;
    }

    init_tracing();

    if let Err(error) = run().await {
        tracing::error!(error = %error, "server stopped");
        std::process::exit(1);
    }
}

fn print_password_hash() -> Result<(), Box<dyn std::error::Error>> {
    let password = std::env::var("ADMIN_PASSWORD")?;
    if password.is_empty() {
        return Err("ADMIN_PASSWORD is empty".into());
    }

    println!(
        "{}",
        auth::hash_password(&password).map_err(|error| error.to_string())?
    );
    Ok(())
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

    let auth = config.admin_password_hash.as_ref().map(|password_hash| {
        Arc::new(auth::Auth::new(
            config.admin_user.clone(),
            password_hash.clone(),
            config.api_token.clone(),
        ))
    });
    if auth.is_none() {
        tracing::warn!("ADMIN_PASSWORD_HASH is not set; admin endpoints are unauthenticated");
    }

    let state = AppState {
        pool,
        rate_limiter: Arc::new(RateLimiter::new(config.rate_limit_per_minute)),
        max_body_bytes: config.max_body_bytes,
        retention_days: config.retention_days,
        allow_debug_telemetry: config.allow_debug_telemetry,
        auth,
    };
    let app = app(state);

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

fn app(state: AppState) -> Router {
    let admin = Router::new()
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
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_admin,
        ));

    let max_body_bytes = state.max_body_bytes;

    Router::new()
        .route("/healthz", get(health))
        .route("/v1/batches", post(ingest::ingest))
        .route("/auth/login", post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/auth/verify", get(auth::verify))
        .merge(admin)
        .layer(DefaultBodyLimit::max(max_body_bytes))
        .layer(RequestBodyLimitLayer::new(max_body_bytes))
        .layer(RequestDecompressionLayer::new())
        .layer(CompressionLayer::new())
        .layer(middleware::from_fn(log_request))
        .with_state(state)
}

async fn log_request(request: Request, next: Next) -> Response {
    let path = request.uri().path();
    if path == "/healthz" || path == "/auth/verify" {
        return next.run(request).await;
    }

    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let span = tracing::info_span!("request", %method, %path);

    async move {
        let started = Instant::now();
        let response = next.run(request).await;
        let status = response.status().as_u16();
        let latency_ms = started.elapsed().as_millis();

        if status >= 500 {
            tracing::error!(status, latency_ms, "FAILED");
        } else if status >= 400 {
            tracing::warn!(status, latency_ms, "REJECTED");
        } else {
            tracing::info!(status, latency_ms, "COMPLETED");
        }

        response
    }
    .instrument(span)
    .await
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
    let json = std::env::var("LOG_FORMAT")
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false);

    let builder = tracing_subscriber::fmt().with_env_filter(filter);

    if json {
        builder.json().with_current_span(false).init();
    } else {
        builder
            .with_target(false)
            .with_ansi(std::io::stdout().is_terminal())
            .init();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::{header, Request, StatusCode};
    use tower::ServiceExt;

    fn test_app(password: Option<&str>) -> Router {
        let pool = PgPoolOptions::new()
            .acquire_timeout(Duration::from_millis(50))
            .connect_lazy("postgres://telemetry@127.0.0.1/telemetry")
            .expect("lazy pool");
        let auth = password.map(|password| {
            Arc::new(auth::Auth::new(
                "admin".into(),
                auth::hash_password(password).expect("hash"),
                Some("token".into()),
            ))
        });

        app(AppState {
            pool,
            rate_limiter: Arc::new(RateLimiter::new(1000)),
            max_body_bytes: 1024 * 1024,
            retention_days: 90,
            allow_debug_telemetry: false,
            auth,
        })
        .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 12345))))
    }

    fn get(uri: &str) -> Request<Body> {
        Request::builder()
            .uri(uri)
            .body(Body::empty())
            .expect("request")
    }

    fn form(body: &str) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/auth/login")
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::from(body.to_owned()))
            .expect("request")
    }

    fn cookie(response: &Response) -> String {
        response.headers()[header::SET_COOKIE]
            .to_str()
            .expect("cookie header")
            .split(';')
            .next()
            .expect("cookie pair")
            .to_owned()
    }

    async fn body_json(response: Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        serde_json::from_slice(&bytes).expect("json body")
    }

    #[tokio::test]
    async fn admin_requires_credentials() {
        let response = test_app(Some("secret"))
            .oneshot(get("/v1/admin/overview"))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn login_sets_a_session_cookie() {
        let app = test_app(Some("secret"));
        let response = app
            .clone()
            .oneshot(form("username=admin&password=secret"))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let cookie = cookie(&response);

        let verify = Request::builder()
            .uri("/auth/verify")
            .header(header::COOKIE, &cookie)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(verify).await.expect("response");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/admin/overview")
                    .header(header::COOKIE, cookie)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn wrong_password_does_not_set_a_cookie() {
        let response = test_app(Some("secret"))
            .oneshot(form("username=admin&password=nope"))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(response.headers().get(header::SET_COOKIE).is_none());
        let body = body_json(response).await;
        assert_eq!(body["error"], "Wrong username or password.");
    }

    #[tokio::test]
    async fn verify_redirects_to_the_requested_page() {
        let response = test_app(Some("secret"))
            .oneshot(
                Request::builder()
                    .uri("/auth/verify")
                    .header("x-forwarded-uri", "/traces?x=1&y=2")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_eq!(
            response.headers()[header::LOCATION],
            "/login?next=/traces%3Fx%3D1%26y%3D2"
        );
    }

    #[tokio::test]
    async fn bearer_token_skips_the_cookie() {
        let response = test_app(Some("secret"))
            .oneshot(
                Request::builder()
                    .uri("/v1/admin/overview")
                    .header(header::AUTHORIZATION, "Bearer token")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn logout_clears_the_session() {
        let app = test_app(Some("secret"));
        let response = app
            .clone()
            .oneshot(form("username=admin&password=secret"))
            .await
            .expect("response");
        let cookie = cookie(&response);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/logout")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert!(response.headers()[header::SET_COOKIE]
            .to_str()
            .expect("cookie header")
            .contains("Max-Age=0"));

        let verify = Request::builder()
            .uri("/auth/verify")
            .header(header::COOKIE, cookie)
            .body(Body::empty())
            .expect("request");
        let response = app.oneshot(verify).await.expect("response");
        assert_eq!(response.status(), StatusCode::FOUND);
    }

    #[tokio::test]
    async fn auth_is_open_without_a_password() {
        let app = test_app(None);

        let response = app
            .clone()
            .oneshot(form("username=admin&password=secret"))
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let response = app
            .oneshot(get("/v1/admin/overview"))
            .await
            .expect("response");
        assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
