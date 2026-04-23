use super::commands::*;
use super::queries::*;
use super::service::AuthService;
use crate::error::Result;
use axum::{
    extract::Json,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use tracing::debug;
use governor::{Quota, RateLimiter, state::{InMemoryState, NotKeyed}, clock::DefaultClock};
use std::num::NonZeroU32;

pub struct AuthHandlers {
    service: Arc<AuthService>,
    ip_extractor: Arc<dyn crate::domain::IpExtractor>,
    login_limiter: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
}

impl AuthHandlers {
    pub fn new(service: Arc<AuthService>, ip_extractor: Arc<dyn crate::domain::IpExtractor>) -> Self {
        Self {
            service,
            ip_extractor,
            login_limiter: RateLimiter::direct(Quota::per_minute(NonZeroU32::new(5).unwrap())),
        }
    }

    fn session_cookie_header(&self, user_id: &str) -> HeaderValue {
        HeaderValue::from_str(&AuthService::build_session_cookie(user_id)).unwrap()
    }

    fn refresh_cookie_response<T: IntoResponse>(&self, user_id: &str, response: T) -> Response {
        let mut response = response.into_response();
        response.headers_mut().append(header::SET_COOKIE, self.session_cookie_header(user_id));
        response
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
                (
                    StatusCode::CREATED,
                    [(header::SET_COOKIE, self.session_cookie_header(&result.user.id))],
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
        // Check rate limit (Priority 2 Security Fix: Prevent brute-force attacks)
        if self.login_limiter.check().is_err() {
            return crate::error::AppError::TooManyRequests(
                "Too many login attempts. Please try again later.".to_string()
            ).into_response();
        }

        let ip = self.ip_extractor.extract(&headers);

        let cmd = LoginCommand {
            username: payload.username,
            password: payload.password,
            ip,
        };

        match self.service.login(cmd).await {
            Ok(result) => (
                StatusCode::OK,
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
            StatusCode::OK,
            [(
                header::SET_COOKIE,
                "user_id=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict",
            )],
        )
            .into_response()
    }

    pub async fn get_current_user(&self, headers: HeaderMap) -> Response {
        match self.get_current_user_internal(&headers).await {
            Ok(user) => {
                debug!("Current user: {}", user.username);
                let user_id = user.id.clone();
                let response = (StatusCode::OK, Json(user)).into_response();
                self.refresh_cookie_response(&user_id, response)
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
                    Ok(result) => self.refresh_cookie_response(
                        &admin.id,
                        (StatusCode::CREATED, Json(result.user)),
                    ),
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
                let user_id = user.id.clone();
                let cmd = ChangePasswordCommand {
                    user_id: user_id.clone(),
                    old_password: payload.old_password,
                    new_password: payload.new_password,
                };

                match self.service.change_password(cmd).await {
                    Ok(_) => self.refresh_cookie_response(
                        &user_id,
                        (StatusCode::OK, Json(serde_json::json!({"success": true}))),
                    ),
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
                let user_id = user.id.clone();
                let cmd = UpdateSettingsCommand {
                    user_id: user_id.clone(),
                    settings: payload.settings,
                };

                match self.service.update_settings(cmd).await {
                    Ok(result) => self.refresh_cookie_response(
                        &user_id,
                        (StatusCode::OK, Json(result.user)),
                    ),
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
                    Ok(result) => self.refresh_cookie_response(
                        &user.id,
                        (StatusCode::OK, Json(result.sessions)),
                    ),
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
