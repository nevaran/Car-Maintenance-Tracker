use super::commands::*;
use super::queries::*;
use crate::domain::Event;
use crate::error::{AppError, Result};
use crate::infra::EventRepository;
use std::sync::Arc;
use tracing::{error, info};

pub struct EventService {
    event_repo: Arc<dyn EventRepository>,
    id_gen: Arc<dyn crate::domain::IdGenerator>,
}

impl EventService {
    pub fn new(event_repo: Arc<dyn EventRepository>, id_gen: Arc<dyn crate::domain::IdGenerator>) -> Self {
        Self { event_repo, id_gen }
    }

    pub async fn list_events(&self, _query: ListEventsQuery) -> Result<ListEventsQueryResult> {
        let events = self.event_repo.load_all().await?;
        Ok(ListEventsQueryResult { events })
    }

    pub async fn create_event(&self, cmd: CreateEventCommand) -> Result<CreateEventCommandResult> {
        let mut events = self.event_repo.load_all().await?;

        let event = Event {
            id: self.id_gen.generate(),
            title: cmd.title,
            date: cmd.date,
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

    pub async fn update_event(&self, cmd: UpdateEventCommand) -> Result<UpdateEventCommandResult> {
        let mut events = self.event_repo.load_all().await?;

        let existing = events
            .iter_mut()
            .find(|event| event.id == cmd.id)
            .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

        if existing.origin_id.is_none() {
            if let Some(title) = cmd.title {
                if !title.trim().is_empty() {
                    existing.title = title;
                }
            }
        }

        if let Some(date) = cmd.date {
            existing.date = date;
        }

        if let Some(cost) = cmd.cost {
            existing.cost = cost;
        }

        if existing.origin_id.is_none() {
            if let Some(repeat) = cmd.repeat {
                existing.repeat = match repeat.as_str() {
                    "yearly" => "yearly".to_string(),
                    _ => "once".to_string(),
                };
            }
        }

        if let Some(notes) = cmd.notes {
            existing.notes = notes;
        }

        if let Some(done) = cmd.done {
            existing.done = done;
        }

        if let Some(origin_id) = cmd.origin_id {
            existing.origin_id = Some(origin_id);
        }

        if let Some(created_year) = cmd.created_year {
            existing.created_year = Some(created_year);
        }

        let response = existing.clone();
        self.event_repo.save_all(&events).await?;

        info!(event_id = %cmd.id, "updated event");
        Ok(UpdateEventCommandResult { event: response })
    }

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
