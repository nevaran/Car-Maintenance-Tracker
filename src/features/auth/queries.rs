use crate::domain::{User, UserRole};
use serde::{Deserialize, Serialize};

/// Query: Get current user from cookie
#[derive(Debug, Clone)]
pub struct GetCurrentUserQuery {
    pub cookie: String,
}

#[derive(Debug)]
pub struct GetCurrentUserQueryResult {
    pub user: User,
}

/// Query: Find user by ID
#[derive(Debug, Clone)]
pub struct FindUserByIdQuery {
    pub id: String,
}

#[derive(Debug)]
pub struct FindUserByIdQueryResult {
    pub user: Option<User>,
}

/// Query: List active sessions
#[derive(Debug, Clone)]
pub struct ListActiveSessionsQuery;

#[derive(Debug, Serialize)]
pub struct ActiveSessionInfo {
    pub username: String,
    pub ip: String,
}

#[derive(Debug)]
pub struct ListActiveSessionsQueryResult {
    pub sessions: Vec<ActiveSessionInfo>,
}

// DTO for HTTP layer
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub settings: std::collections::HashMap<String, String>,
}
