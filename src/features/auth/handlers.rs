use super::commands::*;
use super::queries::*;
use super::service::AuthService;
use crate::error::Result;
use axum::{
    extract::Json,
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use tracing::debug;

pub struct AuthHandlers {
    service: Arc<AuthService>,
    ip_extractor: Arc<dyn crate::domain::IpExtractor>,
}

impl AuthHandlers {
    pub fn new(service: Arc<AuthService>, ip_extractor: Arc<dyn crate::domain::IpExtractor>) -> Self {
        Self {
            service,
            ip_extractor,
        }
    }

    pub async fn register_admin(
        &self,
        Json(payload): Json<CreateUserRequest>,
    ) -> Response {
        let cmd = RegisterAdminCommand {
            username: payload.username,
            password: payload.password,
        };

        match self.service.register_admin(cmd).await {
            Ok(result) => {
                let cookie = format!("user_id={}; Path=/; HttpOnly; SameSite=Strict", result.user.id);
                (
                    axum::http::StatusCode::CREATED,
                    [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
                    Json(result.user),
                )
                    .into_response()
            }
            Err(e) => e.into_response(),
        }
    }

    pub async fn login(
        &self,
        headers: HeaderMap,
        Json(payload): Json<LoginRequest>,
    ) -> Response {
        let ip = self.ip_extractor.extract(&headers);

        let cmd = LoginCommand {
            username: payload.username,
            password: payload.password,
            ip,
        };

        match self.service.login(cmd).await {
            Ok(result) => (
                axum::http::StatusCode::OK,
                [(header::SET_COOKIE, HeaderValue::from_str(&result.cookie).unwrap())],
                Json(result.user),
            )
                .into_response(),
            Err(e) => e.into_response(),
        }
    }

    pub async fn logout(&self, headers: HeaderMap) -> Response {
        if let Ok(user) = self.get_current_user_internal(&headers).await {
            let cmd = LogoutCommand {
                user_id: user.id,
            };
            let _ = self.service.logout(cmd).await;
        }

        (
            axum::http::StatusCode::OK,
            [(
                header::SET_COOKIE,
                "user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; HttpOnly; SameSite=Strict",
            )],
        )
            .into_response()
    }

    pub async fn get_current_user(&self, headers: HeaderMap) -> Response {
        match self.get_current_user_internal(&headers).await {
            Ok(user) => {
                debug!("Current user: {}", user.username);
                (axum::http::StatusCode::OK, Json(user)).into_response()
            }
            Err(e) => e.into_response(),
        }
    }

    pub async fn create_user(
        &self,
        headers: HeaderMap,
        Json(payload): Json<CreateUserRequest>,
    ) -> Response {
        match self.get_current_user_internal(&headers).await {
            Ok(admin) => {
                if !admin.is_admin() {
                    return crate::error::AppError::Forbidden("Admin required".to_string()).into_response();
                }

                let cmd = CreateUserCommand {
                    username: payload.username,
                    password: payload.password,
                    role: payload.role,
                    created_by: admin.username,
                };

                match self.service.create_user(cmd).await {
                    Ok(result) => (axum::http::StatusCode::CREATED, Json(result.user)).into_response(),
                    Err(e) => e.into_response(),
                }
            }
            Err(e) => e.into_response(),
        }
    }

    pub async fn change_password(
        &self,
        headers: HeaderMap,
        Json(payload): Json<ChangePasswordRequest>,
    ) -> Response {
        match self.get_current_user_internal(&headers).await {
            Ok(user) => {
                let cmd = ChangePasswordCommand {
                    user_id: user.id,
                    old_password: payload.old_password,
                    new_password: payload.new_password,
                };

                match self.service.change_password(cmd).await {
                    Ok(_) => (
                        axum::http::StatusCode::OK,
                        Json(serde_json::json!({"success": true})),
                    )
                        .into_response(),
                    Err(e) => e.into_response(),
                }
            }
            Err(e) => e.into_response(),
        }
    }

    pub async fn update_settings(
        &self,
        headers: HeaderMap,
        Json(payload): Json<UpdateSettingsRequest>,
    ) -> Response {
        match self.get_current_user_internal(&headers).await {
            Ok(user) => {
                let cmd = UpdateSettingsCommand {
                    user_id: user.id,
                    settings: payload.settings,
                };

                match self.service.update_settings(cmd).await {
                    Ok(result) => (axum::http::StatusCode::OK, Json(result.user)).into_response(),
                    Err(e) => e.into_response(),
                }
            }
            Err(e) => e.into_response(),
        }
    }

    pub async fn list_active_sessions(&self, headers: HeaderMap) -> Response {
        match self.get_current_user_internal(&headers).await {
            Ok(user) => {
                if !user.is_admin() {
                    return crate::error::AppError::Forbidden("Admin required".to_string()).into_response();
                }

                let query = ListActiveSessionsQuery;
                match self.service.list_active_sessions(query).await {
                    Ok(result) => (axum::http::StatusCode::OK, Json(result.sessions)).into_response(),
                    Err(e) => e.into_response(),
                }
            }
            Err(e) => e.into_response(),
        }
    }

    async fn get_current_user_internal(&self, headers: &HeaderMap) -> Result<crate::domain::User> {
        if let Some(cookie) = headers.get("cookie") {
            let cookie_str = cookie
                .to_str()
                .map_err(|_| crate::error::AppError::Unauthorized("Invalid cookie".to_string()))?;

            let query = GetCurrentUserQuery {
                cookie: cookie_str.to_string(),
            };

            let result = self.service.get_current_user(query).await?;
            return Ok(result.user);
        }

        Err(crate::error::AppError::Unauthorized("Not logged in".to_string()))
    }
}
