use super::commands::*;
use super::queries::*;
use super::service::EventService;
use axum::{
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::NaiveDate;
use std::sync::Arc;

pub struct EventHandlers {
    service: Arc<EventService>,
    auth_service: Arc<crate::features::auth::AuthService>,
}

impl EventHandlers {
    pub fn new(
        service: Arc<EventService>,
        auth_service: Arc<crate::features::auth::AuthService>,
    ) -> Self {
        Self { service, auth_service }
    }

    // Priority 1 Security Fix: Add authentication to Event API
    async fn authenticate_request(&self, headers: &HeaderMap) -> Result<crate::domain::User, Response> {
        if let Some(cookie) = headers.get("cookie") {
            let cookie_str = cookie
                .to_str()
                .map_err(|_| crate::error::AppError::Unauthorized("Invalid cookie".to_string()).into_response())?;

            let query = crate::features::auth::queries::GetCurrentUserQuery {
                cookie: cookie_str.to_string(),
            };

            match self.auth_service.get_current_user(query).await {
                Ok(result) => Ok(result.user),
                Err(e) => Err(e.into_response()),
            }
        } else {
            Err(crate::error::AppError::Unauthorized("Not logged in".to_string()).into_response())
        }
    }

    pub async fn list_events(&self, headers: HeaderMap) -> Response {
        // Priority 1 Security Fix: Require authentication for list_events
        match self.authenticate_request(&headers).await {
            Ok(_user) => {
                let query = ListEventsQuery;
                match self.service.list_events(query).await {
                    Ok(result) => (StatusCode::OK, Json(result.events)).into_response(),
                    Err(e) => e.into_response(),
                }
            }
            Err(e) => e,
        }
    }

    pub async fn create_event(
        &self,
        headers: HeaderMap,
        Json(payload): Json<CreateEventRequest>,
    ) -> Response {
        // Priority 1 & 2 Security Fixes: Require authentication and verify admin role
        let user = match self.authenticate_request(&headers).await {
            Ok(u) => u,
            Err(e) => return e,
        };

        // Priority 2 Security Fix: Check authorization (only admins can create events)
        if !user.is_admin() {
            return crate::error::AppError::Forbidden(
                "Only admins can create events".to_string()
            ).into_response();
        }

        let date_str = match payload
            .date
            .and_then(|d| if d.trim().is_empty() { None } else { Some(d) })
        {
            Some(d) => d,
            None => {
                return crate::error::AppError::BadRequest("Date is required (ISO 8601 format: YYYY-MM-DD)".to_string())
                    .into_response()
            }
        };

        let date = match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
            Ok(d) => {
                // Priority 2 Security Fix: Validate date bounds
                let min_date = NaiveDate::from_ymd_opt(1900, 1, 1).unwrap();
                let max_date = NaiveDate::from_ymd_opt(2100, 12, 31).unwrap();
                
                if d < min_date || d > max_date {
                    return crate::error::AppError::BadRequest(
                        "Date must be between 1900 and 2100".to_string()
                    ).into_response();
                }
                d
            }
            Err(_) => {
                return crate::error::AppError::BadRequest(
                    format!("Invalid date format. Use ISO 8601 format: YYYY-MM-DD (received: {})", date_str)
                )
                .into_response()
            }
        };

        let title = if payload.origin_id.is_some() {
            payload.title.unwrap_or_default()
        } else {
            payload
                .title
                .and_then(|t| if t.trim().is_empty() { None } else { Some(t) })
                .unwrap_or_else(|| "New event".to_string())
        };

        let repeat = if payload.origin_id.is_some() {
            String::new()
        } else {
            match payload.repeat.as_deref() {
                Some("yearly") => "yearly".to_string(),
                _ => "once".to_string(),
            }
        };

        let cmd = CreateEventCommand {
            title,
            date,
            cost: payload.cost.unwrap_or(0.0),
            repeat,
            notes: payload.notes.unwrap_or_default(),
            done: payload.done.unwrap_or(false),
            origin_id: payload.origin_id,
            created_year: payload.created_year,
        };

        match self.service.create_event(cmd).await {
            Ok(result) => (StatusCode::CREATED, Json(result.event)).into_response(),
            Err(e) => e.into_response(),
        }
    }

    pub async fn update_event(
        &self,
        headers: HeaderMap,
        Path(id): Path<String>,
        Json(payload): Json<UpdateEventRequest>,
    ) -> Response {
        // Priority 1 & 2 Security Fixes: Require authentication and verify admin role
        let user = match self.authenticate_request(&headers).await {
            Ok(u) => u,
            Err(e) => return e,
        };

        // Priority 2 Security Fix: Check authorization (only admins can update events)
        if !user.is_admin() {
            return crate::error::AppError::Forbidden(
                "Only admins can update events".to_string()
            ).into_response();
        }

        let date = if let Some(date_str) = payload.date {
            if date_str.trim().is_empty() {
                None
            } else {
                match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
                    Ok(d) => {
                        // Priority 2 Security Fix: Validate date bounds
                        let min_date = NaiveDate::from_ymd_opt(1900, 1, 1).unwrap();
                        let max_date = NaiveDate::from_ymd_opt(2100, 12, 31).unwrap();
                        
                        if d < min_date || d > max_date {
                            return crate::error::AppError::BadRequest(
                                "Date must be between 1900 and 2100".to_string()
                            ).into_response();
                        }
                        Some(d)
                    },
                    Err(_) => {
                        return crate::error::AppError::BadRequest(
                            format!("Invalid date format. Use ISO 8601 format: YYYY-MM-DD (received: {})", date_str)
                        )
                        .into_response()
                    }
                }
            }
        } else {
            None
        };

        let cmd = UpdateEventCommand {
            id,
            title: payload.title,
            date,
            cost: payload.cost,
            repeat: payload.repeat,
            notes: payload.notes,
            done: payload.done,
            origin_id: payload.origin_id,
            created_year: payload.created_year,
        };

        match self.service.update_event(cmd).await {
            Ok(result) => (StatusCode::OK, Json(result.event)).into_response(),
            Err(e) => e.into_response(),
        }
    }

    pub async fn delete_event(&self, headers: HeaderMap, Path(id): Path<String>) -> Response {
        // Priority 1 & 2 Security Fixes: Require authentication and verify admin role
        let user = match self.authenticate_request(&headers).await {
            Ok(u) => u,
            Err(e) => return e,
        };

        // Priority 2 Security Fix: Check authorization (only admins can delete events)
        if !user.is_admin() {
            return crate::error::AppError::Forbidden(
                "Only admins can delete events".to_string()
            ).into_response();
        }

        let cmd = DeleteEventCommand { id };
        match self.service.delete_event(cmd).await {
            Ok(_) => (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response(),
            Err(e) => e.into_response(),
        }
    }
}
