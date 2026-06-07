// Domain models, value types, and interfaces used throughout the app.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::IpAddr;
use std::time::SystemTime;
use chrono::NaiveDate;

use crate::error::Result;

/// Domain model for User
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub role: UserRole,
    pub settings: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum UserRole {
    #[serde(rename = "admin")]
    Admin,
    #[serde(rename = "readonly")]
    ReadOnly,
}

impl From<String> for UserRole {
    fn from(s: String) -> Self {
        match s.as_str() {
            "admin" => UserRole::Admin,
            "readonly" => UserRole::ReadOnly,
            _ => UserRole::ReadOnly,
        }
    }
}

impl ToString for UserRole {
    fn to_string(&self) -> String {
        match self {
            UserRole::Admin => "admin".to_string(),
            UserRole::ReadOnly => "readonly".to_string(),
        }
    }
}

impl User {
    pub fn is_admin(&self) -> bool {
        self.role == UserRole::Admin
    }
}

/// Domain model for Event
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub title: String,
    pub date: NaiveDate,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_date: Option<NaiveDate>,
    #[serde(default)]
    pub email_sent: bool,
    pub cost: f64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub repeat: String,
    pub notes: String,
    pub done: bool,
    pub origin_id: Option<String>,
    pub created_year: Option<u16>,
}

/// Active user session info
#[derive(Debug, Clone)]
pub struct ActiveSession {
    pub user: User,
    pub ip: IpAddr,
    pub last_seen: SystemTime,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersistentSession {
    pub session_id: String,
    pub user: User,
    pub ip: IpAddr,
    pub last_seen: u64,
}

impl PersistentSession {
    pub fn to_active_session(&self) -> ActiveSession {
        ActiveSession {
            user: self.user.clone(),
            ip: self.ip,
            last_seen: SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(self.last_seen),
        }
    }
}

#[async_trait::async_trait]
pub trait SessionRepository: Send + Sync {
    async fn load_all(&self) -> Result<Vec<PersistentSession>>;
    async fn save_all(&self, sessions: &[PersistentSession]) -> Result<()>;
}

/// Audit log entry for security events
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditLog {
    pub timestamp: SystemTime,
    pub action: String,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub ip: IpAddr,
    pub result: String, // "success" or "failure"
    pub details: serde_json::Value,
}

/// Login attempt tracking for account lockout
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoginAttempt {
    pub username: String,
    pub failed_count: u32,
    pub last_attempt: SystemTime,
    pub locked_until: Option<SystemTime>,
}

/// ID generator trait
pub trait IdGenerator: Send + Sync {
    fn generate(&self) -> String;
}

/// IP extraction from headers
pub trait IpExtractor: Send + Sync {
    fn extract(&self, headers: &axum::http::HeaderMap) -> IpAddr;
}

/// Audit repository trait for logging security events
#[async_trait::async_trait]
pub trait AuditRepository: Send + Sync {
    async fn log(&self, log: AuditLog) -> Result<()>;
    async fn load_recent(&self, limit: usize) -> Result<Vec<AuditLog>>;
}
