// Backup manager for events file with daily snapshots and 30-day retention.
use chrono::Local;
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing::{debug, error, info, warn};

pub struct BackupManager {
    events_path: String,
    backup_dir: PathBuf,
}

impl BackupManager {
    /// Create a new backup manager for the events file.
    pub fn new(events_path: impl Into<String>) -> Self {
        let events_path = events_path.into();
        let backup_dir = PathBuf::from("data/backup");
        Self {
            events_path,
            backup_dir,
        }
    }

    /// Perform a daily backup of the events file if one hasn't been done today.
    pub async fn backup_daily(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Ensure backup directory exists
        fs::create_dir_all(&self.backup_dir)
            .await
            .map_err(|e| {
                error!(error = ?e, path = %self.backup_dir.display(), "failed to create backup directory");
                Box::new(e) as Box<dyn std::error::Error>
            })?;

        // Generate backup filename with ISO date
        let today = Local::now().format("%Y-%m-%d").to_string();
        let backup_file = self.backup_dir.join(format!("events_{}.json", today));

        // Check if today's backup already exists
        if backup_file.exists() {
            debug!("Backup for today already exists at {}", backup_file.display());
            return Ok(());
        }

        // Copy events file to backup location
        let source_path = Path::new(&self.events_path);
        if !source_path.exists() {
            debug!("Events file does not exist yet; skipping backup");
            return Ok(());
        }

        fs::copy(source_path, &backup_file).await.map_err(|e| {
            error!(error = ?e, from = %self.events_path, to = %backup_file.display(), "failed to backup events file");
            Box::new(e) as Box<dyn std::error::Error>
        })?;

        info!("Created daily backup: {}", backup_file.display());

        // Clean up backups older than 30 days
        self.cleanup_old_backups().await?;

        Ok(())
    }

    /// Remove backups older than 30 days.
    async fn cleanup_old_backups(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut entries = fs::read_dir(&self.backup_dir)
            .await
            .map_err(|e| {
                error!(error = ?e, "failed to read backup directory");
                Box::new(e) as Box<dyn std::error::Error>
            })?;

        let mut cleaned_count = 0;

        while let Some(entry) = entries.next_entry().await.ok().flatten() {
            if let Ok(metadata) = entry.metadata().await {
                if metadata.is_file() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(system_time_diff) = modified.elapsed() {
                            let days_old = system_time_diff.as_secs() / 86400;
                            if days_old > 30 {
                                if let Err(e) = fs::remove_file(entry.path()).await {
                                    warn!(error = ?e, path = %entry.path().display(), "failed to remove old backup");
                                } else {
                                    debug!(path = %entry.path().display(), days_old, "removed old backup");
                                    cleaned_count += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        if cleaned_count > 0 {
            info!("Cleaned up {} old backup(s)", cleaned_count);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backup_manager_creation() {
        let manager = BackupManager::new("data/events.json");
        assert_eq!(manager.events_path, "data/events.json");
        assert_eq!(manager.backup_dir, PathBuf::from("data/backup"));
    }
}
