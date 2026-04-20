use super::commands::*;
use super::queries::*;
use super::service::EventService;
use axum::{
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::NaiveDate;
use std::sync::Arc;

pub struct EventHandlers {
    service: Arc<EventService>,
}

impl EventHandlers {
    pub fn new(service: Arc<EventService>) -> Self {
        Self { service }
    }

    pub async fn list_events(&self) -> Response {
        let query = ListEventsQuery;
        match self.service.list_events(query).await {
            Ok(result) => (StatusCode::OK, Json(result.events)).into_response(),
            Err(e) => e.into_response(),
        }
    }

    pub async fn create_event(&self, Json(payload): Json<CreateEventRequest>) -> Response {
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
            Ok(d) => d,
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
        Path(id): Path<String>,
        Json(payload): Json<UpdateEventRequest>,
    ) -> Response {
        let date = if let Some(date_str) = payload.date {
            if date_str.trim().is_empty() {
                None
            } else {
                match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
                    Ok(d) => Some(d),
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

    pub async fn delete_event(&self, Path(id): Path<String>) -> Response {
        let cmd = DeleteEventCommand { id };
        match self.service.delete_event(cmd).await {
            Ok(_) => (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response(),
            Err(e) => e.into_response(),
        }
    }
}
