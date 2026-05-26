// Authentication service implementing business rules and repository coordination.
use super::commands::*;
use super::queries::*;
use crate::domain::{ActiveSession, User, UserRole, AuditRepository, AuditLog, LoginAttempt};
use crate::error::{AppError, Result};
use crate::infra::UserRepository;
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use std::sync::Arc;
use std::time::{SystemTime, Duration};
use tokio::sync::Mutex;
use tracing::{debug, info, warn};
use serde_json::json;
use uuid::Uuid;

type SessionStore = Arc<Mutex<std::collections::HashMap<String, ActiveSession>>>;

pub struct AuthService {
    user_repo: Arc<dyn UserRepository>,
    audit_repo: Arc<dyn AuditRepository>,
    id_gen: Arc<dyn crate::domain::IdGenerator>,
    sessions: SessionStore,
    write_lock: Arc<Mutex<()>>,
}

impl AuthService {
    const SESSION_COOKIE_MAX_AGE: i64 = 30 * 24 * 60 * 60; // 30 days

    // Build the HTTP Set-Cookie header value for a user session.
    pub fn build_session_cookie(session_id: &str) -> String {
        let expires = (Utc::now() + chrono::Duration::seconds(Self::SESSION_COOKIE_MAX_AGE))
            .format("%a, %d %b %Y %H:%M:%S GMT")
            .to_string();

        format!(
            "session_id={}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}; Expires={}",
            session_id,
            Self::SESSION_COOKIE_MAX_AGE,
            expires
        )
    }

    // Create a new AuthService with repository dependencies and session tracking.
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        audit_repo: Arc<dyn AuditRepository>,
        id_gen: Arc<dyn crate::domain::IdGenerator>,
    ) -> Self {
        Self {
            user_repo,
            audit_repo,
            id_gen,
            sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
            write_lock: Arc::new(Mutex::new(())),
        }
    }

    // Register the initial admin user during setup.
    pub async fn register_admin(&self, cmd: RegisterAdminCommand) -> Result<RegisterAdminCommandResult> {
        let _guard = self.write_lock.lock().await;
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

        let users = vec![user.clone()];
        self.user_repo.save_all(&users).await?;

        let session_id = Uuid::new_v4().to_string();
        {
            let mut sessions = self.sessions.lock().await;
            sessions.insert(
                session_id.clone(),
                ActiveSession {
                    user: user.clone(),
                    ip: cmd.ip,
                    last_seen: SystemTime::now(),
                },
            );
        }

        let cookie = Self::build_session_cookie(&session_id);
        info!("Admin user {} registered", cmd.username);
        Ok(RegisterAdminCommandResult { user, cookie })
    }

    // Authenticate a user, enforce account lockout, and log authentication events.
    pub async fn login(&self, cmd: LoginCommand) -> Result<LoginCommandResult> {
        debug!("Login attempt for user: {}", cmd.username);

        // Check if account is locked (Account Lockout Fix)
        let attempt = self.get_login_attempt(&cmd.username).await?;
        if let Some(locked_until) = attempt.locked_until {
            if SystemTime::now() < locked_until {
                let remaining = locked_until.duration_since(SystemTime::now())
                    .unwrap_or(Duration::from_secs(0));
                
                // Log lockout event
                let _ = self.audit_repo.log(AuditLog {
                    timestamp: SystemTime::now(),
                    action: "login_attempt".to_string(),
                    user_id: None,
                    username: Some(cmd.username.clone()),
                    ip: cmd.ip,
                    result: "failure - account locked".to_string(),
                    details: json!({
                        "username": cmd.username,
                        "remaining_seconds": remaining.as_secs()
                    }),
                }).await;

                return Err(AppError::TooManyRequests(
                    format!("Account locked. Try again in {} seconds", remaining.as_secs())
                ));
            }
        }
        
        let user = self
            .user_repo
            .find_by_username(&cmd.username)
            .await?
            .ok_or_else(|| {
                // Log failed login attempt - user not found
                let _ = self.audit_repo.log(AuditLog {
                    timestamp: SystemTime::now(),
                    action: "login_attempt".to_string(),
                    user_id: None,
                    username: Some(cmd.username.clone()),
                    ip: cmd.ip,
                    result: "failure - user not found".to_string(),
                    details: json!({"username": cmd.username}),
                });

                AppError::Unauthorized("Invalid credentials".to_string())
            })?;

        if !verify(&cmd.password, &user.password_hash)
            .map_err(|_| AppError::InternalError("Password verification failed".to_string()))?
        {
            warn!("Invalid password for user {} from {}", cmd.username, cmd.ip);

            // Increment failed attempts and potentially lock account
            self.increment_failed_attempt(&cmd.username).await?;
            let updated_attempt = self.get_login_attempt(&cmd.username).await?;
            
            // Lock account after 5 failed attempts
            if updated_attempt.failed_count >= 5 {
                self.lock_account(&cmd.username, Duration::from_secs(900)).await?; // 15 minutes
                
                // Log account lockout
                let _ = self.audit_repo.log(AuditLog {
                    timestamp: SystemTime::now(),
                    action: "account_locked".to_string(),
                    user_id: Some(user.id.clone()),
                    username: Some(user.username.clone()),
                    ip: cmd.ip,
                    result: "failure - account locked after multiple failures".to_string(),
                    details: json!({
                        "username": user.username,
                        "failed_attempts": updated_attempt.failed_count
                    }),
                }).await;
            } else {
                // Log failed password attempt
                let _ = self.audit_repo.log(AuditLog {
                    timestamp: SystemTime::now(),
                    action: "login_attempt".to_string(),
                    user_id: Some(user.id.clone()),
                    username: Some(user.username.clone()),
                    ip: cmd.ip,
                    result: "failure - invalid password".to_string(),
                    details: json!({
                        "username": user.username,
                        "failed_attempts": updated_attempt.failed_count
                    }),
                }).await;
            }

            return Err(AppError::Unauthorized("Invalid credentials".to_string()));
        }

        // Reset failed attempts on successful login
        self.reset_login_attempt(&cmd.username).await?;

        // Log successful login
        let _ = self.audit_repo.log(AuditLog {
            timestamp: SystemTime::now(),
            action: "login".to_string(),
            user_id: Some(user.id.clone()),
            username: Some(user.username.clone()),
            ip: cmd.ip,
            result: "success".to_string(),
            details: json!({
                "username": user.username,
                "role": user.role.to_string()
            }),
        }).await;

        // Record active session with an unpredictable session token
        let session_id = Uuid::new_v4().to_string();
        {
            let mut sessions = self.sessions.lock().await;
            sessions.insert(
                session_id.clone(),
                ActiveSession {
                    user: user.clone(),
                    ip: cmd.ip,
                    last_seen: SystemTime::now(),
                },
            );
        }

        let cookie = Self::build_session_cookie(&session_id);
        info!("User {} logged in successfully from {}", cmd.username, cmd.ip);
        
        Ok(LoginCommandResult { user, cookie })
    }

    pub async fn logout(&self, cmd: LogoutCommand) -> Result<LogoutCommandResult> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(&cmd.session_id);
        Ok(LogoutCommandResult)
    }

    pub async fn create_user(&self, cmd: CreateUserCommand) -> Result<CreateUserCommandResult> {
        let _guard = self.write_lock.lock().await;
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
        let _guard = self.write_lock.lock().await;
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

    // Account lockout methods
    async fn get_login_attempt(&self, username: &str) -> Result<LoginAttempt> {
        let path = "data/login_attempts.json";
        let content = tokio::fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "{}".to_string());

        let attempts: std::collections::HashMap<String, LoginAttempt> = 
            serde_json::from_str(&content)
            .unwrap_or_default();

        Ok(attempts.get(username).cloned().unwrap_or_else(|| LoginAttempt {
            username: username.to_string(),
            failed_count: 0,
            last_attempt: SystemTime::now(),
            locked_until: None,
        }))
    }

    async fn save_login_attempt(&self, attempt: &LoginAttempt) -> Result<()> {
        let path = "data/login_attempts.json";
        let content = tokio::fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "{}".to_string());

        let mut attempts: std::collections::HashMap<String, LoginAttempt> = 
            serde_json::from_str(&content)
            .unwrap_or_default();

        attempts.insert(attempt.username.clone(), attempt.clone());

        let json = serde_json::to_string_pretty(&attempts)
            .map_err(|_| AppError::InternalError("Failed to serialize login attempts".to_string()))?;

        tokio::fs::write(path, json)
            .await
            .map_err(|_| AppError::InternalError("Failed to write login attempts".to_string()))?;

        Ok(())
    }

    async fn increment_failed_attempt(&self, username: &str) -> Result<()> {
        let mut attempt = self.get_login_attempt(username).await?;
        attempt.failed_count += 1;
        attempt.last_attempt = SystemTime::now();
        self.save_login_attempt(&attempt).await
    }

    async fn reset_login_attempt(&self, username: &str) -> Result<()> {
        let attempt = LoginAttempt {
            username: username.to_string(),
            failed_count: 0,
            last_attempt: SystemTime::now(),
            locked_until: None,
        };
        self.save_login_attempt(&attempt).await
    }

    async fn lock_account(&self, username: &str, duration: Duration) -> Result<()> {
        let mut attempt = self.get_login_attempt(username).await?;
        attempt.locked_until = Some(SystemTime::now() + duration);
        self.save_login_attempt(&attempt).await
    }

    pub async fn update_settings(&self, cmd: UpdateSettingsCommand) -> Result<UpdateSettingsCommandResult> {
        let _guard = self.write_lock.lock().await;
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
        // Extract session_id from cookie with proper validation
        let mut session_id = None;
        
        for part in query.cookie.split(';') {
            let part = part.trim();
            if let Some(id) = part.strip_prefix("session_id=") {
                if !id.is_empty() && id.len() < 256 {
                    session_id = Some(id.to_string());
                }
                break; // Only use the first session_id cookie
            }
        }
        
        let session_id = session_id
            .ok_or_else(|| AppError::Unauthorized("Not logged in".to_string()))?;

        debug!("Extracted session_id: {}", session_id);

        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get_mut(&session_id) {
            if SystemTime::now().duration_since(session.last_seen)
                .unwrap_or_default()
                .as_secs() as i64
                > Self::SESSION_COOKIE_MAX_AGE
            {
                sessions.remove(&session_id);
                return Err(AppError::Unauthorized("Session expired".to_string()));
            }

            session.last_seen = SystemTime::now();
            return Ok(GetCurrentUserQueryResult {
                user: session.user.clone(),
                session_id,
            });
        }

        Err(AppError::Unauthorized("User session invalid".to_string()))
    }

    pub async fn list_active_sessions(&self, _query: ListActiveSessionsQuery) -> Result<ListActiveSessionsQueryResult> {
        // Ensure expired sessions are removed before listing active sessions
        self.prune_expired_sessions().await;

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

    // Remove sessions older than the session cookie max age to prevent unbounded memory growth.
    pub async fn prune_expired_sessions(&self) {
        let mut sessions = self.sessions.lock().await;
        let now = SystemTime::now();
        let expiry_secs = Self::SESSION_COOKIE_MAX_AGE as u64;

        let expired_keys: Vec<String> = sessions
            .iter()
            .filter_map(|(k, s)| {
                if now.duration_since(s.last_seen).unwrap_or_default().as_secs() > expiry_secs {
                    Some(k.clone())
                } else {
                    None
                }
            })
            .collect();

        for k in expired_keys {
            sessions.remove(&k);
        }
    }
}
