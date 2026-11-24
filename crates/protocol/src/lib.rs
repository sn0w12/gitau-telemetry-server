//! Wire types and validation shared by the desktop client and the telemetry
//! server.
//!
//! The types mirror the JSON emitted by the client's `telemetry` crate. The
//! server validates every batch against the caps here before it writes
//! anything.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const SCHEMA_VERSION: u32 = 1;

pub const MAX_TRACES: usize = 256;
pub const MAX_SPANS: usize = 32_768;
pub const MAX_DEPTH: usize = 64;
pub const MAX_ATTRIBUTES: usize = 64;
pub const MAX_STANDALONE_ERRORS: usize = 512;
pub const MAX_SOURCES: usize = 8;
pub const MAX_NAME: usize = 256;
pub const MAX_KEY: usize = 64;
pub const MAX_CODE: usize = 64;
pub const MAX_KIND: usize = 128;
pub const MAX_MESSAGE: usize = 2048;
pub const MAX_TEXT: usize = 512;
pub const MAX_CONTEXT: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub schema_version: u32,
    pub created_at_unix_ms: u64,
    pub context: EnvironmentContext,
    #[serde(default)]
    pub traces: Vec<Trace>,
    #[serde(default)]
    pub errors: Vec<ErrorRecord>,
    #[serde(default)]
    pub dropped_traces: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentContext {
    pub app_version: String,
    pub build_profile: String,
    pub os: String,
    pub arch: String,
    pub cpu_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    pub start_unix_ms: u64,
    pub duration_us: u64,
    #[serde(default)]
    pub dropped_spans: u64,
    pub root: Span,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub name: String,
    pub start_us: u64,
    pub duration_us: u64,
    #[serde(default)]
    pub attributes: BTreeMap<String, AttrValue>,
    #[serde(default)]
    pub error: Option<ErrorRecord>,
    #[serde(default)]
    pub children: Vec<Span>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorRecord {
    pub code: String,
    pub kind: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub at_unix_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AttrValue {
    Bool(bool),
    Int(i64),
    Uint(u64),
    Float(f64),
    Text(String),
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("unsupported schema version {0}, expected {SCHEMA_VERSION}")]
    SchemaVersion(u32),
    #[error("{0}")]
    Invalid(String),
}

impl Batch {
    /// Rejects payloads that exceed the ingest contract. Call this after
    /// deserializing and before any database work.
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(ValidationError::SchemaVersion(self.schema_version));
        }
        validate_context(&self.context)?;

        if self.traces.len() > MAX_TRACES {
            return Err(invalid(format!(
                "too many traces: {} > {MAX_TRACES}",
                self.traces.len()
            )));
        }
        if self.errors.len() > MAX_STANDALONE_ERRORS {
            return Err(invalid(format!(
                "too many standalone errors: {} > {MAX_STANDALONE_ERRORS}",
                self.errors.len()
            )));
        }

        let mut spans = 0usize;
        for trace in &self.traces {
            validate_span(&trace.root, 0, &mut spans)?;
        }
        for error in &self.errors {
            validate_error(error)?;
        }

        Ok(())
    }
}

fn validate_context(context: &EnvironmentContext) -> Result<(), ValidationError> {
    validate_text("app_version", &context.app_version, MAX_CONTEXT, true)?;
    validate_text("build_profile", &context.build_profile, 32, true)?;
    validate_text("os", &context.os, 32, true)?;
    validate_text("arch", &context.arch, 32, true)?;
    validate_text("cpu_tier", &context.cpu_tier, 32, true)?;
    Ok(())
}

fn validate_span(span: &Span, depth: usize, total: &mut usize) -> Result<(), ValidationError> {
    if depth > MAX_DEPTH {
        return Err(invalid(format!("span nesting exceeds {MAX_DEPTH}")));
    }
    *total += 1;
    if *total > MAX_SPANS {
        return Err(invalid(format!("too many spans, limit is {MAX_SPANS}")));
    }

    validate_text("span name", &span.name, MAX_NAME, true)?;

    if span.attributes.len() > MAX_ATTRIBUTES {
        return Err(invalid(format!(
            "too many attributes on span `{}`: {} > {MAX_ATTRIBUTES}",
            span.name,
            span.attributes.len()
        )));
    }
    for (key, value) in &span.attributes {
        if !valid_key(key) {
            return Err(invalid(format!(
                "invalid attribute key on span `{}`",
                span.name
            )));
        }
        if let AttrValue::Text(text) = value {
            validate_text("attribute value", text, MAX_TEXT, false)?;
        }
    }

    if let Some(error) = &span.error {
        validate_error(error)?;
    }

    for child in &span.children {
        validate_span(child, depth + 1, total)?;
    }
    Ok(())
}

fn validate_error(error: &ErrorRecord) -> Result<(), ValidationError> {
    if !valid_key(&error.code) {
        return Err(invalid("invalid error code"));
    }
    validate_text("error kind", &error.kind, MAX_KIND, true)?;
    if let Some(message) = &error.message {
        validate_text("error message", message, MAX_MESSAGE, false)?;
    }
    if error.sources.len() > MAX_SOURCES {
        return Err(invalid(format!(
            "too many error sources: {} > {MAX_SOURCES}",
            error.sources.len()
        )));
    }
    for source in &error.sources {
        validate_text("error source", source, MAX_MESSAGE, false)?;
    }
    Ok(())
}

fn validate_text(
    field: &str,
    value: &str,
    max_chars: usize,
    non_empty: bool,
) -> Result<(), ValidationError> {
    if non_empty && value.is_empty() {
        return Err(invalid(format!("{field} is empty")));
    }
    if value.chars().count() > max_chars {
        return Err(invalid(format!("{field} exceeds {max_chars} characters")));
    }
    if value.chars().any(char::is_control) {
        return Err(invalid(format!("{field} contains a control character")));
    }
    Ok(())
}

fn valid_key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_CODE
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'_' | b'-')
        })
}

fn invalid(message: impl Into<String>) -> ValidationError {
    ValidationError::Invalid(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(code: &str) -> ErrorRecord {
        ErrorRecord {
            code: code.into(),
            kind: "test::Error".into(),
            message: Some("failed".into()),
            sources: vec!["source".into()],
            at_unix_ms: None,
        }
    }

    fn span(name: &str, children: Vec<Span>) -> Span {
        Span {
            name: name.into(),
            start_us: 0,
            duration_us: 1,
            attributes: BTreeMap::new(),
            error: None,
            children,
        }
    }

    fn batch(root: Span) -> Batch {
        Batch {
            schema_version: SCHEMA_VERSION,
            created_at_unix_ms: 1,
            context: EnvironmentContext {
                app_version: "0.3.0".into(),
                build_profile: "release".into(),
                os: "linux".into(),
                arch: "x86_64".into(),
                cpu_tier: "medium".into(),
            },
            traces: vec![Trace {
                start_unix_ms: 1,
                duration_us: 1,
                dropped_spans: 0,
                root,
            }],
            errors: Vec::new(),
            dropped_traces: 0,
        }
    }

    #[test]
    fn accepts_a_normal_batch() {
        let mut root = span("load_repository", vec![span("read_index", Vec::new())]);
        root.attributes.insert("files".into(), AttrValue::Uint(3));
        root.error = Some(error("index.read_failed"));
        assert!(batch(root).validate().is_ok());
    }

    #[test]
    fn rejects_unknown_schema() {
        let mut payload = batch(span("root", Vec::new()));
        payload.schema_version = 2;
        assert_eq!(payload.validate(), Err(ValidationError::SchemaVersion(2)));
    }

    #[test]
    fn rejects_deep_trees() {
        let mut node = span("leaf", Vec::new());
        for _ in 0..=MAX_DEPTH {
            node = span("node", vec![node]);
        }
        assert!(batch(node).validate().is_err());
    }

    #[test]
    fn rejects_invalid_attribute_keys() {
        let mut root = span("root", Vec::new());
        root.attributes
            .insert("Not Valid".into(), AttrValue::Bool(true));
        assert!(batch(root).validate().is_err());
    }

    #[test]
    fn rejects_oversized_text() {
        let mut root = span("root", Vec::new());
        root.attributes
            .insert("label".into(), AttrValue::Text("x".repeat(MAX_TEXT + 1)));
        assert!(batch(root).validate().is_err());
    }

    #[test]
    fn rejects_control_characters() {
        let root = span("bad\nname", Vec::new());
        assert!(batch(root).validate().is_err());
    }

    #[test]
    fn rejects_too_many_spans() {
        let mut root = span("root", Vec::new());
        root.children = (0..MAX_SPANS).map(|_| span("leaf", Vec::new())).collect();
        assert!(batch(root).validate().is_err());
    }
}
