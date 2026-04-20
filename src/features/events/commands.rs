use crate::domain::Event;
use chrono::NaiveDate;

/// Command: Create event
#[derive(Debug, Clone)]
pub struct CreateEventCommand {
    pub title: String,
    pub date: NaiveDate,
    pub cost: f64,
    pub repeat: String,
    pub notes: String,
    pub done: bool,
    pub origin_id: Option<String>,
    pub created_year: Option<u16>,
}

#[derive(Debug)]
pub struct CreateEventCommandResult {
    pub event: Event,
}

/// Command: Update event
#[derive(Debug, Clone)]
pub struct UpdateEventCommand {
    pub id: String,
    pub title: Option<String>,
    pub date: Option<NaiveDate>,
    pub cost: Option<f64>,
    pub repeat: Option<String>,
    pub notes: Option<String>,
    pub done: Option<bool>,
    pub origin_id: Option<String>,
    pub created_year: Option<u16>,
}

#[derive(Debug)]
pub struct UpdateEventCommandResult {
    pub event: Event,
}

/// Command: Delete event
#[derive(Debug, Clone)]
pub struct DeleteEventCommand {
    pub id: String,
}

#[derive(Debug)]
pub struct DeleteEventCommandResult;
