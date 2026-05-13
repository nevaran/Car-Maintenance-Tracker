// Health and setup handlers for service availability and initial admin setup checks.
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
        // Check if there are any users in the database
        match self.user_repo.load_all().await {
            Ok(users) => {
                let needs_setup = users.is_empty();
                (
                    axum::http::StatusCode::OK,
                    Json(serde_json::json!({"needs_setup": needs_setup})),
                )
                    .into_response()
            }
            Err(_) => {
                // On error, assume setup is needed to allow initial setup
                (
                    axum::http::StatusCode::OK,
                    Json(serde_json::json!({"needs_setup": true})),
                )
                    .into_response()
            }
        }
    }
}
