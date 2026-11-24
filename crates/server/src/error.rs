use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use telemetry_protocol::ValidationError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("{0}")]
    BadRequest(String),
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("rate limit exceeded")]
    RateLimited,
    #[error("not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("{0}")]
    Internal(String),
}

impl From<ValidationError> for ApiError {
    fn from(error: ValidationError) -> Self {
        Self::BadRequest(error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::BadRequest(message) => (StatusCode::BAD_REQUEST, message.clone()),
            Self::PayloadTooLarge => (StatusCode::PAYLOAD_TOO_LARGE, "payload too large".into()),
            Self::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded".into()),
            Self::NotFound => (StatusCode::NOT_FOUND, "not found".into()),
            Self::Database(error) => {
                tracing::error!(error = %error, "database request failed");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "storage unavailable".into(),
                )
            }
            Self::Internal(error) => {
                tracing::error!(error = %error, "internal request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".into(),
                )
            }
        };

        let mut response = (status, Json(json!({ "error": message }))).into_response();
        if status == StatusCode::TOO_MANY_REQUESTS {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, header::HeaderValue::from_static("60"));
        }
        response
    }
}
