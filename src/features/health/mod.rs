use crate::infra::UserRepository;
use axum::{response::{IntoResponse, Response}, Json};
use std::sync::Arc;

pub struct HealthHandlers {
    user_repo: Arc<dyn UserRepository>,
}

impl HealthHandlers {
    pub fn new(user_repo: Arc<dyn UserRepository>) -> Self {
        Self { user_repo }
    }

    pub async fn check_setup(&self) -> Response {
        // Priority 2 Security Fix: Hide setup status to prevent reconnaissance
        // Always return false to indicate system is configured
        (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({"needs_setup": false})),
        )
            .into_response()
    }
}
