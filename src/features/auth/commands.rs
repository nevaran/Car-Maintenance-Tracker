use crate::domain::User;
use std::collections::HashMap;

/// Command: Register/Setup admin user
#[derive(Debug, Clone)]
pub struct RegisterAdminCommand {
    pub username: String,
    pub password: String,
}

#[derive(Debug)]
pub struct RegisterAdminCommandResult {
    pub user: User,
}

/// Command: Login user
#[derive(Debug, Clone)]
pub struct LoginCommand {
    pub username: String,
    pub password: String,
    pub ip: std::net::IpAddr,
}

#[derive(Debug)]
pub struct LoginCommandResult {
    pub user: User,
    pub cookie: String,
}

/// Command: Logout user
#[derive(Debug, Clone)]
pub struct LogoutCommand {
    pub user_id: String,
}

#[derive(Debug)]
pub struct LogoutCommandResult;

/// Command: Create user
#[derive(Debug, Clone)]
pub struct CreateUserCommand {
    pub username: String,
    pub password: String,
    pub role: String,
    pub created_by: String,
}

#[derive(Debug)]
pub struct CreateUserCommandResult {
    pub user: User,
}

/// Command: Change password
#[derive(Debug, Clone)]
pub struct ChangePasswordCommand {
    pub user_id: String,
    pub old_password: String,
    pub new_password: String,
}

#[derive(Debug)]
pub struct ChangePasswordCommandResult;

/// Command: Update settings
#[derive(Debug, Clone)]
pub struct UpdateSettingsCommand {
    pub user_id: String,
    pub settings: HashMap<String, String>,
}

#[derive(Debug)]
pub struct UpdateSettingsCommandResult {
    pub user: User,
}
