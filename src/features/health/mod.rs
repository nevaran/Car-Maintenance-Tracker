use crate::infra::UserRepository;
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use std::sync::Arc;
use tracing::debug;

pub struct HealthHandlers {
    user_repo: Arc<dyn UserRepository>,
}

impl HealthHandlers {
    pub fn new(user_repo: Arc<dyn UserRepository>) -> Self {
        Self { user_repo }
    }

    pub async fn check_setup(&self) -> Response {
        match self.user_repo.load_all().await {
            Ok(users) => {
                debug!("Check setup: {} users exist", users.len());
                (
                    StatusCode::OK,
                    Json(serde_json::json!({"needs_setup": users.is_empty()})),
                )
                    .into_response()
            }
            Err(e) => e.into_response(),
        }
    }
}
