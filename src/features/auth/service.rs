use super::commands::*;
use super::queries::*;
use crate::domain::{ActiveSession, User, UserRole};
use crate::error::{AppError, Result};
use crate::infra::UserRepository;
use bcrypt::{hash, verify, DEFAULT_COST};
use std::net::IpAddr;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

type ActiveSessions = Arc<Mutex<std::collections::HashMap<String, ActiveSession>>>;

pub struct AuthService {
    user_repo: Arc<dyn UserRepository>,
    id_gen: Arc<dyn crate::domain::IdGenerator>,
    sessions: ActiveSessions,
}

impl AuthService {
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        id_gen: Arc<dyn crate::domain::IdGenerator>,
    ) -> Self {
        Self {
            user_repo,
            id_gen,
            sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    pub async fn register_admin(&self, cmd: RegisterAdminCommand) -> Result<RegisterAdminCommandResult> {
        let users = self.user_repo.load_all().await?;
        
        if !users.is_empty() {
            warn!("Setup attempted but users already exist");
            return Err(AppError::Conflict("Users already exist".to_string()));
        }

        let hash = hash(&cmd.password, DEFAULT_COST)
            .map_err(|_| AppError::InternalError("Failed to hash password".to_string()))?;

        let user = User {
            id: self.id_gen.generate(),
            username: cmd.username.clone(),
            password_hash: hash,
            role: UserRole::Admin,
            settings: Default::default(),
        };

        let mut users = vec![user.clone()];
        self.user_repo.save_all(&users).await?;

        info!("Admin user {} registered", cmd.username);
        Ok(RegisterAdminCommandResult { user })
    }

    pub async fn login(&self, cmd: LoginCommand) -> Result<LoginCommandResult> {
        debug!("Login attempt for user: {}", cmd.username);
        
        let user = self
            .user_repo
            .find_by_username(&cmd.username)
            .await?
            .ok_or_else(|| AppError::Unauthorized("Invalid credentials".to_string()))?;

        if !verify(&cmd.password, &user.password_hash)
            .map_err(|_| AppError::InternalError("Password verification failed".to_string()))?
        {
            warn!("Invalid password for user {} from {}", cmd.username, cmd.ip);
            return Err(AppError::Unauthorized("Invalid credentials".to_string()));
        }

        // Record active session
        {
            let mut sessions = self.sessions.lock().await;
            sessions.insert(
                user.id.clone(),
                ActiveSession {
                    user: user.clone(),
                    ip: cmd.ip,
                    last_seen: SystemTime::now(),
                },
            );
        }

        let cookie = format!("user_id={}; Path=/; HttpOnly; SameSite=Strict", user.id);
        info!("User {} logged in successfully from {}", cmd.username, cmd.ip);
        
        Ok(LoginCommandResult { user, cookie })
    }

    pub async fn logout(&self, cmd: LogoutCommand) -> Result<LogoutCommandResult> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(&cmd.user_id);
        Ok(LogoutCommandResult)
    }

    pub async fn create_user(&self, cmd: CreateUserCommand) -> Result<CreateUserCommandResult> {
        info!("Creating user: {} with role: {}", cmd.username, cmd.role);

        // Validate role
        let role = match cmd.role.as_str() {
            "admin" => UserRole::Admin,
            "readonly" => UserRole::ReadOnly,
            _ => return Err(AppError::BadRequest("Invalid role".to_string())),
        };

        let hash = hash(&cmd.password, DEFAULT_COST)
            .map_err(|_| AppError::InternalError("Failed to hash password".to_string()))?;

        let user = User {
            id: self.id_gen.generate(),
            username: cmd.username.clone(),
            password_hash: hash,
            role,
            settings: Default::default(),
        };

        let mut users = self.user_repo.load_all().await?;
        users.push(user.clone());
        self.user_repo.save_all(&users).await?;

        info!("User {} created successfully by {}", cmd.username, cmd.created_by);
        Ok(CreateUserCommandResult { user })
    }

    pub async fn change_password(&self, cmd: ChangePasswordCommand) -> Result<ChangePasswordCommandResult> {
        let user = self
            .user_repo
            .find_by_id(&cmd.user_id)
            .await?
            .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;

        if !verify(&cmd.old_password, &user.password_hash)
            .map_err(|_| AppError::InternalError("Password verification failed".to_string()))?
        {
            return Err(AppError::BadRequest("Wrong old password".to_string()));
        }

        let new_hash = hash(&cmd.new_password, DEFAULT_COST)
            .map_err(|_| AppError::InternalError("Failed to hash password".to_string()))?;

        let mut users = self.user_repo.load_all().await?;
        if let Some(u) = users.iter_mut().find(|u| u.id == cmd.user_id) {
            u.password_hash = new_hash;
            self.user_repo.save_all(&users).await?;
        }

        Ok(ChangePasswordCommandResult)
    }

    pub async fn update_settings(&self, cmd: UpdateSettingsCommand) -> Result<UpdateSettingsCommandResult> {
        let mut user = self
            .user_repo
            .find_by_id(&cmd.user_id)
            .await?
            .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;

        user.settings = cmd.settings;

        let mut users = self.user_repo.load_all().await?;
        if let Some(u) = users.iter_mut().find(|u| u.id == cmd.user_id) {
            *u = user.clone();
            self.user_repo.save_all(&users).await?;
        }

        Ok(UpdateSettingsCommandResult { user })
    }

    // Queries
    pub async fn get_current_user(&self, query: GetCurrentUserQuery) -> Result<GetCurrentUserQueryResult> {
        for part in query.cookie.split(';') {
            let part = part.trim();
            if let Some(user_id) = part.strip_prefix("user_id=") {
                debug!("Extracted user_id: {}", user_id);
                let user = self.user_repo.find_by_id(user_id).await?;
                
                if let Some(user) = user {
                    // Update last_seen
                    let mut sessions = self.sessions.lock().await;
                    if let Some(session) = sessions.get_mut(&user.id) {
                        session.last_seen = SystemTime::now();
                    }
                    
                    return Ok(GetCurrentUserQueryResult { user });
                }
            }
        }

        Err(AppError::Unauthorized("Not logged in".to_string()))
    }

    pub async fn list_active_sessions(&self, _query: ListActiveSessionsQuery) -> Result<ListActiveSessionsQueryResult> {
        let sessions = self.sessions.lock().await;
        let now = SystemTime::now();
        
        let sessions_list: Vec<_> = sessions
            .values()
            .filter(|s| {
                now.duration_since(s.last_seen)
                    .unwrap_or_default()
                    .as_secs() < 300 // 5 minutes
            })
            .map(|s| ActiveSessionInfo {
                username: s.user.username.clone(),
                ip: s.ip.to_string(),
            })
            .collect();

        Ok(ListActiveSessionsQueryResult {
            sessions: sessions_list,
        })
    }
}
