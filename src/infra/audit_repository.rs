use crate::domain::{AuditLog, AuditRepository};
use crate::error::Result;
use std::path::Path;
use tokio::fs;
use tracing::{debug, error};

/// File-based audit repository implementation
pub struct FileAuditRepository {
    path: String,
}

impl FileAuditRepository {
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into(),
        }
    }
}

#[async_trait::async_trait]
impl AuditRepository for FileAuditRepository {
    async fn log(&self, log: AuditLog) -> Result<()> {
        let mut logs: Vec<AuditLog> = self.load_recent(1000).await.unwrap_or_default();
        logs.push(log);

        // Keep only the last 1000 entries to prevent file from growing too large
        if logs.len() > 1000 {
            let len = logs.len();
            logs = logs.into_iter().skip(len - 1000).collect();
        }

        let json = serde_json::to_string_pretty(&logs)
            .map_err(|_| crate::error::AppError::InternalError("Failed to serialize audit logs".to_string()))?;

        let path = Path::new(&self.path);

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|_| crate::error::AppError::InternalError("Failed to create data directory".to_string()))?;
        }

        fs::write(path, json)
            .await
            .map_err(|err| {
                error!(error = ?err, path = %self.path, "failed to write audit log file");
                crate::error::AppError::InternalError("Failed to write audit log file".to_string())
            })?;

        debug!("Logged audit event to {}", self.path);
        Ok(())
    }

    async fn load_recent(&self, limit: usize) -> Result<Vec<AuditLog>> {
        let path = Path::new(&self.path);

        let content = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());

        let mut logs: Vec<AuditLog> = serde_json::from_str(&content)
            .map_err(|_| crate::error::AppError::InternalError("Failed to parse audit logs".to_string()))?;

        // Sort by timestamp (most recent first) and limit
        logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        logs.truncate(limit);

        Ok(logs)
    }
}