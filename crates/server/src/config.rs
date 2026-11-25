use std::env;
use std::net::SocketAddr;
use std::str::FromStr;
use std::time::Duration;

use sqlx::postgres::PgConnectOptions;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database: PgConnectOptions,
    pub retention_days: i64,
    pub cleanup_interval: Duration,
    pub max_body_bytes: usize,
    pub rate_limit_per_minute: u32,
    pub migrate_on_start: bool,
    pub allow_debug_telemetry: bool,
    pub admin_user: String,
    pub admin_password_hash: Option<String>,
    pub api_token: Option<String>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("{0}")]
    Invalid(String),
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database = database_options()?;
        let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
        let bind_addr: SocketAddr = bind_addr
            .parse()
            .map_err(|_| ConfigError::Invalid(format!("invalid BIND_ADDR `{bind_addr}`")))?;
        let retention_days = parse_env("RETENTION_DAYS", 90i64)?;
        if retention_days < 1 {
            return Err(ConfigError::Invalid(
                "RETENTION_DAYS must be at least 1".into(),
            ));
        }
        let cleanup_hours = parse_env("CLEANUP_INTERVAL_HOURS", 24u64)?;
        let max_body_bytes = parse_env("MAX_BODY_BYTES", 8 * 1024 * 1024usize)?;
        let rate_limit_per_minute = parse_env("RATE_LIMIT_PER_MINUTE", 120u32)?;
        let migrate_on_start = parse_bool("MIGRATE_ON_START", true)?;
        let allow_debug_telemetry = parse_bool("ALLOW_DEBUG_TELEMETRY", false)?;
        let admin_user = env::var("ADMIN_USER").unwrap_or_else(|_| "admin".into());
        let admin_password_hash = match env::var("ADMIN_PASSWORD_HASH")
            .ok()
            .filter(|value| !value.is_empty())
        {
            Some(hash) => {
                crate::auth::validate_password_hash(&hash).map_err(|error| {
                    ConfigError::Invalid(format!("invalid ADMIN_PASSWORD_HASH: {error}"))
                })?;
                Some(hash)
            }
            None => None,
        };
        if admin_password_hash.is_none() && !bind_addr.ip().is_loopback() {
            return Err(ConfigError::Invalid(
                "ADMIN_PASSWORD_HASH is required on a non-loopback BIND_ADDR".into(),
            ));
        }
        let api_token = env::var("API_TOKEN").ok().filter(|value| !value.is_empty());

        Ok(Self {
            bind_addr,
            database,
            retention_days,
            cleanup_interval: Duration::from_secs(cleanup_hours * 3600),
            max_body_bytes,
            rate_limit_per_minute,
            migrate_on_start,
            allow_debug_telemetry,
            admin_user,
            admin_password_hash,
            api_token,
        })
    }
}

fn database_options() -> Result<PgConnectOptions, ConfigError> {
    if let Ok(url) = env::var("DATABASE_URL") {
        return PgConnectOptions::from_str(&url)
            .map_err(|error| ConfigError::Invalid(format!("invalid DATABASE_URL: {error}")));
    }

    let host = env::var("PGHOST").unwrap_or_else(|_| "localhost".into());
    let port = parse_env("PGPORT", 5432u16)?;
    let user = env::var("PGUSER").unwrap_or_else(|_| "telemetry".into());
    let database = env::var("PGDATABASE").unwrap_or_else(|_| "telemetry".into());

    let mut options = PgConnectOptions::new()
        .host(&host)
        .port(port)
        .username(&user)
        .database(&database);
    if let Ok(password) = env::var("PGPASSWORD") {
        options = options.password(&password);
    }
    Ok(options)
}

fn parse_env<T>(name: &str, default: T) -> Result<T, ConfigError>
where
    T: FromStr,
{
    match env::var(name) {
        Ok(value) => value
            .parse()
            .map_err(|_| ConfigError::Invalid(format!("invalid {name} `{value}`"))),
        Err(_) => Ok(default),
    }
}

fn parse_bool(name: &str, default: bool) -> Result<bool, ConfigError> {
    match env::var(name) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Ok(true),
            "0" | "false" | "no" | "off" => Ok(false),
            _ => Err(ConfigError::Invalid(format!("invalid {name} `{value}`"))),
        },
        Err(_) => Ok(default),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_booleans_case_insensitively() {
        assert!(matches!(
            parse_bool("TELEMETRY_TEST_MISSING", true),
            Ok(true)
        ));
    }
}
