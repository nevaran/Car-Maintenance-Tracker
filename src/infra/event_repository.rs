// File-based event repository implementation for event persistence.
use crate::domain::Event;
use crate::error::Result;
use std::path::Path;
use tokio::{fs, sync::Mutex};
use tracing::{debug, error};

/// Event repository trait
#[async_trait::async_trait]
pub trait EventRepository: Send + Sync {
    async fn load_all(&self) -> Result<Vec<Event>>;
    async fn save_all(&self, events: &[Event]) -> Result<()>;
}

/// File-based event repository implementation
pub struct FileEventRepository {
    path: String,
    file_lock: Mutex<()>,
}

impl FileEventRepository {
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            file_lock: Mutex::new(()),
        }
    }
}

#[async_trait::async_trait]
impl EventRepository for FileEventRepository {
    async fn load_all(&self) -> Result<Vec<Event>> {
        let path = Path::new(&self.path);
        let _guard = self.file_lock.lock().await;

        if !path.exists() {
            debug!(path = %self.path, "data file does not exist, returning empty events");
            return Ok(Vec::new());
        }

        let contents = fs::read_to_string(path)
            .await
            .map_err(|_| crate::error::AppError::InternalError("Failed to read events file".to_string()))?;

        if contents.trim().is_empty() {
            return Ok(Vec::new());
        }

        match serde_json::from_str::<Vec<Event>>(&contents) {
            Ok(events) => Ok(events),
            Err(err) => {
                error!(path = %self.path, error = ?err, "failed to parse events.json, returning empty events");
                Ok(Vec::new())
            }
        }
    }

    async fn save_all(&self, events: &[Event]) -> Result<()> {
        let path = Path::new(&self.path);
        let _guard = self.file_lock.lock().await;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|_| crate::error::AppError::InternalError("Failed to create data directory".to_string()))?;
        }

        let data = serde_json::to_string_pretty(events)
            .map_err(|_| crate::error::AppError::InternalError("Failed to serialize events".to_string()))?;

        // Write to a temporary file and rename for atomic replacement
        let tmp_path = path.with_extension("json.tmp");
        fs::write(&tmp_path, &data)
            .await
            .map_err(|err| {
                error!(path = %self.path, error = ?err, "failed to write temp events file");
                crate::error::AppError::InternalError("Failed to write events file".to_string())
            })?;

        fs::rename(&tmp_path, path)
            .await
            .map_err(|err| {
                error!(path = %self.path, error = ?err, "failed to atomically rename events file");
                crate::error::AppError::InternalError("Failed to save events file".to_string())
            })
    }
}
