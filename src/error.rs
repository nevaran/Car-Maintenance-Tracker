use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::fmt;

/// Application error type following clean architecture principles
#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    BadRequest(String),
    Conflict(String),
    InternalError(String),
    TooManyRequests(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "Not found: {}", msg),
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            Self::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            Self::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            Self::Conflict(msg) => write!(f, "Conflict: {}", msg),
            Self::InternalError(msg) => write!(f, "Internal error: {}", msg),
            Self::TooManyRequests(msg) => write!(f, "Too many requests: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            Self::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            Self::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            Self::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            Self::Conflict(msg) => (StatusCode::CONFLICT, msg),
            Self::InternalError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            Self::TooManyRequests(msg) => (StatusCode::TOO_MANY_REQUESTS, msg),
        };

        (status, Json(json!({"error": message}))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
