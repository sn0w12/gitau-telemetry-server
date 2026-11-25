use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{ConnectInfo, Form, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Redirect, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::error::ApiError;
use crate::rate_limit::RateLimiter;
use crate::AppState;

const COOKIE_NAME: &str = "gitau_session";
const SESSION_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 7);
const LOGIN_LIMIT_PER_MINUTE: u32 = 10;

struct SessionState {
    entries: HashMap<String, Instant>,
    last_cleanup: Instant,
}

pub struct Auth {
    user: String,
    password_hash: String,
    api_token: Option<String>,
    sessions: Mutex<SessionState>,
    login_limiter: RateLimiter,
}

impl Auth {
    pub fn new(user: String, password_hash: String, api_token: Option<String>) -> Self {
        Self {
            user,
            password_hash,
            api_token,
            sessions: Mutex::new(SessionState {
                entries: HashMap::new(),
                last_cleanup: Instant::now(),
            }),
            login_limiter: RateLimiter::new(LOGIN_LIMIT_PER_MINUTE),
        }
    }

    pub fn verify_password(&self, password: &str) -> bool {
        PasswordHash::new(&self.password_hash)
            .ok()
            .is_some_and(|hash| {
                Argon2::default()
                    .verify_password(password.as_bytes(), &hash)
                    .is_ok()
            })
    }

    pub fn allowed(&self, headers: &HeaderMap) -> bool {
        if self.api_token.as_deref().is_some_and(|expected| {
            bearer_token(headers)
                .is_some_and(|token| constant_time_eq(token.as_bytes(), expected.as_bytes()))
        }) {
            return true;
        }

        session_token(headers).is_some_and(|token| self.valid_session(token))
    }

    pub fn check_login_rate(&self, ip: IpAddr) -> bool {
        self.login_limiter.check(ip)
    }

    fn valid_session(&self, token: &str) -> bool {
        let now = Instant::now();
        let mut state = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        match state.entries.get(token) {
            Some(expires) if *expires > now => true,
            Some(_) => {
                state.entries.remove(token);
                false
            }
            None => false,
        }
    }

    fn create_session(&self) -> String {
        let token = Uuid::new_v4().simple().to_string();
        let now = Instant::now();
        let mut state = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if now.duration_since(state.last_cleanup) >= Duration::from_secs(600) {
            state.entries.retain(|_, expires| *expires > now);
            state.last_cleanup = now;
        }
        state.entries.insert(token.clone(), now + SESSION_TTL);
        token
    }

    fn remove_session(&self, token: &str) {
        let mut state = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.entries.remove(token);
    }
}

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
}

pub fn validate_password_hash(hash: &str) -> Result<(), String> {
    let parsed = PasswordHash::new(hash).map_err(|error| error.to_string())?;
    if !parsed.algorithm.as_str().starts_with("argon2") {
        return Err("expected an Argon2 hash".into());
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct LoginForm {
    username: String,
    password: String,
}

pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Form(form): Form<LoginForm>,
) -> Response {
    let Some(auth) = state.auth.as_ref() else {
        return StatusCode::NO_CONTENT.into_response();
    };

    let ip = client_ip(&headers).unwrap_or_else(|| addr.ip());
    if !auth.check_login_rate(ip) {
        return login_error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many attempts. Try again in a minute.",
        );
    }

    let user_matches = constant_time_eq(form.username.trim().as_bytes(), auth.user.as_bytes());

    let verifier = auth.clone();
    let password = form.password.clone();
    let password_matches = tokio::task::spawn_blocking(move || verifier.verify_password(&password))
        .await
        .unwrap_or(false);
    if !(user_matches & password_matches) {
        return login_error(StatusCode::UNAUTHORIZED, "Wrong username or password.");
    }

    let token = auth.create_session();
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        session_cookie(&token, is_https(&headers)),
    );
    response
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(auth) = state.auth.as_ref() {
        if let Some(token) = session_token(&headers) {
            auth.remove_session(token);
        }
    }

    let mut response = Redirect::to("/login").into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, clear_cookie(is_https(&headers)));
    response
}

pub async fn verify(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let allowed = state
        .auth
        .as_ref()
        .is_none_or(|auth| auth.allowed(&headers));
    if allowed {
        return StatusCode::NO_CONTENT.into_response();
    }

    let next = headers
        .get("x-forwarded-uri")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("/");
    let location = format!("/login?next={}", encode_component(next));
    let value =
        HeaderValue::from_str(&location).unwrap_or_else(|_| HeaderValue::from_static("/login"));

    (StatusCode::FOUND, [(header::LOCATION, value)]).into_response()
}

pub async fn require_admin(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let allowed = state
        .auth
        .as_ref()
        .is_none_or(|auth| auth.allowed(request.headers()));
    if allowed {
        return next.run(request).await;
    }

    let mut response = ApiError::Unauthorized.into_response();
    response
        .headers_mut()
        .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
    response
}

fn login_error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

fn session_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .find_map(|pair| {
            let (name, value) = pair.trim().split_once('=')?;
            (name == COOKIE_NAME).then_some(value)
        })
}

fn client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    headers
        .get("x-forwarded-for")?
        .to_str()
        .ok()?
        .split(',')
        .next()?
        .trim()
        .parse()
        .ok()
}

fn is_https(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|proto| proto.eq_ignore_ascii_case("https"))
}

fn session_cookie(token: &str, secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{secure}",
        SESSION_TTL.as_secs()
    ))
    .expect("session cookie is valid ASCII")
}

fn clear_cookie(secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}"
    ))
    .expect("session cookie is valid ASCII")
}

fn encode_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auth() -> Auth {
        Auth::new(
            "admin".into(),
            hash_password("secret").expect("hash"),
            Some("token".into()),
        )
    }

    #[test]
    fn verifies_hashed_passwords() {
        let auth = auth();
        assert!(auth.verify_password("secret"));
        assert!(!auth.verify_password("secret "));
    }

    #[test]
    fn rejects_non_argon2_hashes() {
        assert!(validate_password_hash("not a hash").is_err());
        assert!(validate_password_hash(&hash_password("secret").expect("hash")).is_ok());
    }

    #[test]
    fn sessions_are_created_and_removed() {
        let auth = auth();
        let token = auth.create_session();
        assert!(auth.valid_session(&token));
        auth.remove_session(&token);
        assert!(!auth.valid_session(&token));
    }

    #[test]
    fn accepts_bearer_and_cookie_credentials() {
        let auth = auth();
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer token"),
        );
        assert!(auth.allowed(&headers));

        let token = auth.create_session();
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_str(&format!("other=1; {COOKIE_NAME}={token}")).unwrap(),
        );
        assert!(auth.allowed(&headers));

        let headers = HeaderMap::new();
        assert!(!auth.allowed(&headers));
    }

    #[test]
    fn reads_only_the_session_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("gitau_session_extra=no; gitau_session=yes"),
        );
        assert_eq!(session_token(&headers), Some("yes"));
    }

    #[test]
    fn encodes_query_values() {
        assert_eq!(
            encode_component("/traces?span=a&b=c"),
            "/traces%3Fspan%3Da%26b%3Dc"
        );
    }

    #[test]
    fn compares_without_short_circuiting() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secreT"));
        assert!(!constant_time_eq(b"secret", b"secre"));
    }

    #[test]
    fn session_cookie_is_hardened() {
        let value = session_cookie("abc", true);
        let value = value.to_str().unwrap();
        assert!(value.contains("HttpOnly"));
        assert!(value.contains("SameSite=Lax"));
        assert!(value.contains("; Secure"));
        assert!(clear_cookie(false).to_str().unwrap().contains("Max-Age=0"));
    }
}
