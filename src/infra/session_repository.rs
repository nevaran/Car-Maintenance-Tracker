// File-based session repository implementation for loading and saving active sessions.
use crate::domain::{PersistentSession, SessionRepository};
use crate::error::Result;
use std::path::Path;
use tokio::{fs, sync::Mutex};
use tracing::{debug, error};

pub struct FileSessionRepository {
    path: String,
    file_lock: Mutex<()>,
}

impl FileSessionRepository {
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            file_lock: Mutex::new(()),
        }
    }
}

#[async_trait::async_trait]
impl SessionRepository for FileSessionRepository {
    async fn load_all(&self) -> Result<Vec<PersistentSession>> {
        let path = Path::new(&self.path);
        let _guard = self.file_lock.lock().await;

        let content = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());

        debug!(path = %self.path, length = content.len(), "Loaded sessions data");

        let sessions: Vec<PersistentSession> = serde_json::from_str(&content)
            .map_err(|_| crate::error::AppError::InternalError("Failed to parse sessions".to_string()))?;

        Ok(sessions)
    }

    async fn save_all(&self, sessions: &[PersistentSession]) -> Result<()> {
        let path = Path::new(&self.path);
        let _guard = self.file_lock.lock().await;

        let json = serde_json::to_string_pretty(sessions)
            .map_err(|_| crate::error::AppError::InternalError("Failed to serialize sessions".to_string()))?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|_| crate::error::AppError::InternalError("Failed to create data directory".to_string()))?;
        }

        debug!(path = %self.path, length = json.len(), "Saving session data");

        let tmp_path = path.with_extension("json.tmp");
        fs::write(&tmp_path, &json)
            .await
            .map_err(|err| {
                error!(error = ?err, path = %self.path, "failed to write temp sessions file");
                crate::error::AppError::InternalError("Failed to write sessions file".to_string())
            })?;

        fs::rename(&tmp_path, path)
            .await
            .map_err(|err| {
                error!(error = ?err, path = %self.path, "failed to atomically rename sessions file");
                crate::error::AppError::InternalError("Failed to save sessions file".to_string())
            })?;

        Ok(())
    }
}
