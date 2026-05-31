// Business logic for event management and repository orchestration.
use super::commands::*;
use super::queries::*;
use crate::domain::Event;
use chrono::Datelike;
use crate::error::{AppError, Result};
use crate::infra::EventRepository;
use std::sync::Arc;
use tracing::{error, info};

pub struct EventService {
    event_repo: Arc<dyn EventRepository>,
    id_gen: Arc<dyn crate::domain::IdGenerator>,
}

// Event service implementing list, create, update, and delete business logic.
impl EventService {
    // Construct the event service with persistence and ID generation dependencies.
    pub fn new(event_repo: Arc<dyn EventRepository>, id_gen: Arc<dyn crate::domain::IdGenerator>) -> Self {
        Self { event_repo, id_gen }
    }

    // Load all persisted events from storage.
    pub async fn list_events(&self, _query: ListEventsQuery) -> Result<ListEventsQueryResult> {
        let events = self.event_repo.load_all().await?;
        Ok(ListEventsQueryResult { events })
    }

    // Create a new event record and persist it.
    pub async fn create_event(&self, cmd: CreateEventCommand) -> Result<CreateEventCommandResult> {
        let mut events = self.event_repo.load_all().await?;

        let event = Event {
            id: self.id_gen.generate(),
            title: cmd.title,
            date: cmd.date,
            end_date: cmd.end_date,
            cost: cmd.cost,
            repeat: cmd.repeat,
            notes: cmd.notes,
            done: cmd.done,
            origin_id: cmd.origin_id.clone(),
            created_year: cmd.created_year,
        };

        events.push(event.clone());
        self.event_repo.save_all(&events).await?;

        info!(
            id = %event.id,
            origin_id = ?event.origin_id,
            created_year = ?event.created_year,
            "created new event"
        );

        Ok(CreateEventCommandResult { event })
    }

    // Update an existing event if found.
    pub async fn update_event(&self, cmd: UpdateEventCommand) -> Result<UpdateEventCommandResult> {
        let mut events = self.event_repo.load_all().await?;

        // Locate the event by index to avoid holding simultaneous mutable borrows
        let pos = events.iter().position(|event| event.id == cmd.id).ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

        // Clone current snapshot for branch operations (split path will remove/insert)
        let existing_snapshot = events[pos].clone();

        if existing_snapshot.origin_id.is_none() {
            if let Some(title) = cmd.title.clone() {
                if !title.trim().is_empty() {
                    events[pos].title = title;
                }
            }
        }

        if let Some(date) = cmd.date {
            // If updating a non-root yearly occurrence's date, split recurrence
            if existing_snapshot.origin_id.is_some() && existing_snapshot.repeat == "yearly" {
                let new_start = date;
                let prev_year = new_start.year() - 1;

                // If parent exists, set its end_date to previous year
                if let Some(parent_id) = existing_snapshot.origin_id.clone() {
                    if let Some(parent_pos) = events.iter().position(|e| e.id == parent_id) {
                        events[parent_pos].end_date = Some(chrono::NaiveDate::from_ymd_opt(prev_year, events[parent_pos].date.month(), events[parent_pos].date.day()).unwrap_or(events[parent_pos].date));
                    }
                }

                // Create new base yearly event
                let new_event = Event {
                    id: self.id_gen.generate(),
                    title: existing_snapshot.title.clone(),
                    date: new_start,
                    end_date: None,
                    cost: existing_snapshot.cost,
                    repeat: "yearly".to_string(),
                    notes: existing_snapshot.notes.clone(),
                    done: false,
                    origin_id: None,
                    created_year: Some(new_start.year() as u16),
                };

                // Remove this occurrence (override) if present and add the new series
                events.retain(|e| e.id != existing_snapshot.id);
                events.push(new_event.clone());

                // Persist and return the new event as response
                self.event_repo.save_all(&events).await?;
                return Ok(UpdateEventCommandResult { event: new_event });
            }

            // Non-split update: update in place
            events[pos].date = date;
        }

        if let Some(end_date) = cmd.end_date {
            events[pos].end_date = Some(end_date);
        }

        if let Some(cost) = cmd.cost {
            events[pos].cost = cost;
        }
        if events[pos].origin_id.is_none() {
            if let Some(repeat) = cmd.repeat.clone() {
                events[pos].repeat = match repeat.as_str() {
                    "yearly" => "yearly".to_string(),
                    _ => "once".to_string(),
                };
            }
        }

        if let Some(notes) = cmd.notes {
            events[pos].notes = notes;
        }

        if let Some(done) = cmd.done {
            events[pos].done = done;
        }

        if let Some(origin_id) = cmd.origin_id {
            events[pos].origin_id = Some(origin_id);
        }

        if let Some(created_year) = cmd.created_year {
            events[pos].created_year = Some(created_year);
        }

        let response = events[pos].clone();
        self.event_repo.save_all(&events).await?;

        info!(event_id = %cmd.id, "updated event");
        Ok(UpdateEventCommandResult { event: response })
    }

    // Delete an event and any related recurring derivatives.
    pub async fn delete_event(&self, cmd: DeleteEventCommand) -> Result<DeleteEventCommandResult> {
        let mut events = self.event_repo.load_all().await?;

        let original_len = events.len();
        events.retain(|event| event.id != cmd.id && event.origin_id.as_deref() != Some(&cmd.id));

        if events.len() == original_len {
            error!(event_id = %cmd.id, "event to delete not found");
            return Err(AppError::NotFound("Event not found".to_string()));
        }

        self.event_repo.save_all(&events).await?;

        info!(event_id = %cmd.id, "deleted event");
        Ok(DeleteEventCommandResult)
    }
}
