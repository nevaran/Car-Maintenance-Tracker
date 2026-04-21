use crate::domain::Event;
use serde::Deserialize;

/// Query: Get all events
#[derive(Debug, Clone)]
pub struct ListEventsQuery;

#[derive(Debug)]
pub struct ListEventsQueryResult {
    pub events: Vec<Event>,
}

/// DTO for HTTP layer
#[derive(Debug, Deserialize)]
pub struct CreateEventRequest {
    pub id: Option<String>,
    pub title: Option<String>,
    pub date: Option<String>,
    pub cost: Option<f64>,
    pub repeat: Option<String>,
    pub notes: Option<String>,
    pub done: Option<bool>,
    pub origin_id: Option<String>,
    pub created_year: Option<u16>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEventRequest {
    pub id: Option<String>,
    pub title: Option<String>,
    pub date: Option<String>,
    pub cost: Option<f64>,
    pub repeat: Option<String>,
    pub notes: Option<String>,
    pub done: Option<bool>,
    pub origin_id: Option<String>,
    pub created_year: Option<u16>,
}
