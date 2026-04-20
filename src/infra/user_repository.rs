use crate::domain::User;
use crate::error::Result;
use std::path::Path;
use tokio::fs;
use tracing::{debug, error};

/// User repository trait
#[async_trait::async_trait]
pub trait UserRepository: Send + Sync {
    async fn load_all(&self) -> Result<Vec<User>>;
    async fn save_all(&self, users: &[User]) -> Result<()>;
    async fn find_by_username(&self, username: &str) -> Result<Option<User>>;
    async fn find_by_id(&self, id: &str) -> Result<Option<User>>;
}

/// File-based user repository implementation
pub struct FileUserRepository {
    path: String,
}

impl FileUserRepository {
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into(),
        }
    }
}

#[async_trait::async_trait]
impl UserRepository for FileUserRepository {
    async fn load_all(&self) -> Result<Vec<User>> {
        let path = Path::new(&self.path);
        
        let content = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());

        debug!("Loaded users content length: {} bytes", content.len());

        let users: Vec<User> = serde_json::from_str(&content)
            .map_err(|_| crate::error::AppError::InternalError("Failed to parse users".to_string()))?;

        debug!("Loaded {} users", users.len());
        Ok(users)
    }

    async fn save_all(&self, users: &[User]) -> Result<()> {
        let path = Path::new(&self.path);
        
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|_| crate::error::AppError::InternalError("Failed to create data directory".to_string()))?;
        }

        let json = serde_json::to_string_pretty(users)
            .map_err(|_| crate::error::AppError::InternalError("Failed to serialize users".to_string()))?;

        debug!("Saving users JSON: {} bytes", json.len());

        fs::write(path, json)
            .await
            .map_err(|err| {
                error!(error = ?err, path = %self.path, "failed to write users file");
                crate::error::AppError::InternalError("Failed to write users file".to_string())
            })?;

        debug!("Saved {} users to {}", users.len(), self.path);
        Ok(())
    }

    async fn find_by_username(&self, username: &str) -> Result<Option<User>> {
        let users = self.load_all().await?;
        Ok(users.into_iter().find(|u| u.username == username))
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<User>> {
        let users = self.load_all().await?;
        Ok(users.into_iter().find(|u| u.id == id))
    }
}
