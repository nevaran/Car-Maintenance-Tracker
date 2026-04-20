use axum::extract::{ConnectInfo, Json, Path};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::Router;
use bcrypt::{hash, verify, DEFAULT_COST};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use axum::serve;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

const DATA_PATH: &str = "data/events.json";
const USERS_PATH: &str = "data/users.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Event {
    id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    title: String,
    date: String,
    cost: f64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    repeat: String,
    notes: String,
    done: bool,
    origin_id: Option<String>,
    created_year: Option<u16>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct User {
    id: String,
    username: String,
    password_hash: String,
    role: String,
    settings: HashMap<String, String>,
}

type ActiveUsers = Arc<Mutex<HashMap<String, (User, std::net::IpAddr, SystemTime)>>>;
static ACTIVE_USERS: OnceLock<ActiveUsers> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct InputEvent {
    id: Option<String>,
    title: Option<String>,
    date: Option<String>,
    cost: Option<f64>,
    repeat: Option<String>,
    notes: Option<String>,
    done: Option<bool>,
    origin_id: Option<String>,
    created_year: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct LoginPayload {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct CreateUserPayload {
    username: String,
    password: String,
    role: String,
}

#[derive(Debug, Deserialize)]
struct ChangePasswordPayload {
    old_password: String,
    new_password: String,
}

async fn load_users() -> Result<Vec<User>, Box<dyn std::error::Error>> {
    let content = tokio::fs::read_to_string(USERS_PATH).await.unwrap_or_else(|_| "[]".to_string());
    debug!("Loaded users content: {}", content);
    let users: Vec<User> = serde_json::from_str(&content)?;
    info!("Loaded {} users", users.len());
    Ok(users)
}

async fn save_users(users: &Vec<User>) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(users)?;
    debug!("Saving users JSON: {}", json);
    tokio::fs::create_dir_all("data").await?;
    tokio::fs::write(USERS_PATH, json).await?;
    info!("Saved {} users to {}", users.len(), USERS_PATH);
    Ok(())
}

async fn get_current_user(headers: &HeaderMap) -> Option<User> {
    if let Some(cookie) = headers.get("cookie") {
        let cookie_str = cookie.to_str().ok()?;
        debug!("Cookie string: {}", cookie_str);
        for part in cookie_str.split(';') {
            let part = part.trim();
            if let Some(user_id) = part.strip_prefix("user_id=") {
                debug!("Extracted user_id: {}", user_id);
                let users = load_users().await.ok()?;
                let user = users.into_iter().find(|u| u.id == user_id);
                if let Some(ref u) = user {
                    let mut active = ACTIVE_USERS.get().unwrap().lock().await;
                    if let Some(entry) = active.get_mut(&u.id) {
                        entry.2 = SystemTime::now();
                    }
                }
                if user.is_some() {
                    debug!("Found user: {}", user.as_ref().unwrap().username);
                } else {
                    debug!("User not found for id: {}", user_id);
                }
                return user;
            }
        }
    }
    debug!("No cookie or user_id found");
    None
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with_target(false)
        .with_writer(std::io::stdout)
        .init();

    let app = Router::new()
        .route("/api/events", get(get_events).post(create_event))
        .route(
            "/api/events/{id}",
            put(update_event).delete(delete_event),
        )
        .route("/api/setup", get(check_setup).post(setup_admin))
        .route("/api/login", post(login))
        .route("/api/logout", get(logout))
        .route("/api/current_user", get(current_user))
        .route("/api/active_users", get(active_users))
        .route("/api/users", post(create_user))
        .route("/api/settings", put(update_settings))
        .route("/api/change_password", put(change_password));

    ACTIVE_USERS.set(Arc::new(Mutex::new(HashMap::new()))).unwrap();

    let app = app
        .fallback_service(
            ServeDir::new("public")
                .append_index_html_on_directories(true)
                .fallback(ServeFile::new("public/index.html")),
        )
        .layer(TraceLayer::new_for_http());

    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    info!("starting Car Maintenance Tracker on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}

async fn get_events() -> impl IntoResponse {
    debug!("handling get_events");
    match load_events().await {
        Ok(events) => {
            debug!(count = events.len(), "loaded events");
            (StatusCode::OK, Json(events)).into_response()
        }
        Err(err) => {
            error!(error = ?err, "failed to load events");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<Event>::new())).into_response()
        }
    }
}

async fn create_event(headers: HeaderMap, Json(input): Json<InputEvent>) -> impl IntoResponse {
    debug!(?input, "handling create_event");
    let user = get_current_user(&headers).await;
    if user.as_ref().map(|u| u.role != "admin").unwrap_or(true) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Admin required"}))).into_response();
    }
    let date = match input.date {
        Some(date) if !date.trim().is_empty() => date,
        _ => {
            error!("create_event missing date");
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Date is required."}))).into_response();
        }
    };

    let mut events = match load_events().await {
        Ok(events) => events,
        Err(_) => Vec::new(),
    };

    let event = Event {
        id: generate_id(),
        title: if input.origin_id.is_some() {
            input.title.unwrap_or_default()
        } else {
            input
                .title
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "New event".to_string())
        },
        date,
        cost: input.cost.unwrap_or(0.0),
        repeat: if input.origin_id.is_some() {
            String::new()
        } else {
            match input.repeat.as_deref() {
                Some("yearly") => "yearly".to_string(),
                _ => "once".to_string(),
            }
        },
        notes: input.notes.unwrap_or_default(),
        done: input.done.unwrap_or(false),
        origin_id: input.origin_id.clone(),
        created_year: input.created_year,
    };

    events.push(event.clone());
    if let Err(err) = save_events(&events).await {
        error!(error = ?err, "failed to save new event");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Could not save event."})),
        )
            .into_response();
    }

    info!(
        id = %event.id,
        origin_id = ?event.origin_id,
        created_year = ?event.created_year,
        "created new event"
    );
    (StatusCode::CREATED, Json(event)).into_response()
}

async fn update_event(
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<InputEvent>,
) -> impl IntoResponse {
    debug!(event_id = %id, ?input, "handling update_event");
    let user = get_current_user(&headers).await;
    if user.as_ref().map(|u| u.role != "admin").unwrap_or(true) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Admin required"}))).into_response();
    }
    let mut events = match load_events().await {
        Ok(events) => events,
        Err(_) => Vec::new(),
    };

    let existing = match events.iter_mut().find(|event| event.id == id) {
        Some(existing) => existing,
        None => return (StatusCode::NOT_FOUND, Json(json!({"error": "Event not found."}))).into_response(),
    };

    if existing.origin_id.is_none() {
        existing.title = input
            .title
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| existing.title.clone());
    }
    existing.date = input.date.unwrap_or_else(|| existing.date.clone());
    existing.cost = input.cost.unwrap_or(0.0);
    if existing.origin_id.is_none() {
        if let Some(repeat_value) = input.repeat.as_deref() {
            existing.repeat = match repeat_value {
                "yearly" => "yearly".to_string(),
                _ => "once".to_string(),
            };
        }
    }
    existing.notes = input.notes.unwrap_or_else(|| existing.notes.clone());
    existing.done = input.done.unwrap_or(false);
    if let Some(origin_id) = input.origin_id.clone() {
        existing.origin_id = Some(origin_id);
    }
    if let Some(created_year) = input.created_year {
        existing.created_year = Some(created_year);
    }
    let response = existing.clone();

    if let Err(err) = save_events(&events).await {
        error!(error = ?err, event_id = %id, "failed to save updated event list");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Could not save event."})),
        )
            .into_response();
    }

    info!(event_id = %id, "updated event");
    (StatusCode::OK, Json(response)).into_response()
}

async fn delete_event(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    info!(event_id = %id, "handling delete_event");
    let user = get_current_user(&headers).await;
    if user.as_ref().map(|u| u.role != "admin").unwrap_or(true) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Admin required"}))).into_response();
    }
    let mut events = match load_events().await {
        Ok(events) => events,
        Err(_) => Vec::new(),
    };

    let original_len = events.len();
    events.retain(|event| event.id != id && event.origin_id.as_deref() != Some(&id));

    if events.len() == original_len {
        error!(event_id = %id, "event to delete not found");
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Event not found."}))).into_response();
    }

    if let Err(err) = save_events(&events).await {
        error!(error = ?err, event_id = %id, "failed to save event list after delete");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Could not save event."})),
        )
            .into_response();
    }

    (StatusCode::OK, Json(json!({"success": true}))).into_response()
}

async fn load_events() -> Result<Vec<Event>, std::io::Error> {
    let path = PathBuf::from(DATA_PATH);
    if !path.exists() {
        debug!(path = %DATA_PATH, "data file does not exist, returning empty events");
        return Ok(Vec::new());
    }

    let contents = tokio::fs::read_to_string(&path).await?;
    let events = if contents.trim().is_empty() {
        Vec::new()
    } else {
        match serde_json::from_str(&contents) {
            Ok(events) => events,
            Err(err) => {
                error!(path = %DATA_PATH, error = ?err, "failed to parse events.json, returning empty events");
                Vec::new()
            }
        }
    };
    Ok(events)
}

async fn save_events(events: &[Event]) -> Result<(), std::io::Error> {
    let path = PathBuf::from(DATA_PATH);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let data = serde_json::to_string_pretty(events)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err.to_string()))?;
    tokio::fs::write(&path, data).await.map_err(|err| {
        error!(path = %DATA_PATH, error = ?err, "failed to write events file");
        err
    })
}

fn generate_id() -> String {
    static COUNTER: OnceLock<AtomicU64> = OnceLock::new();
    let counter = COUNTER.get_or_init(|| AtomicU64::new(0));
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = counter.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}", timestamp, id)
}

async fn check_setup() -> impl IntoResponse {
    let users = load_users().await.unwrap_or_default();
    debug!("Check setup: {} users exist", users.len());
    Json(json!({"needs_setup": users.is_empty()}))
}

async fn setup_admin(Json(payload): Json<CreateUserPayload>) -> Response {
    info!("Setting up admin user: {}", payload.username);
    let users = load_users().await.unwrap_or_default();
    if !users.is_empty() {
        warn!("Setup attempted but users already exist");
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Users already exist"}))).into_response();
    }
    let hash = hash(payload.password, DEFAULT_COST).unwrap();
    debug!("Hashed password for user {}", payload.username);
    let user = User {
        id: generate_id(),
        username: payload.username.clone(),
        password_hash: hash,
        role: "admin".to_string(),
        settings: HashMap::new(),
    };
    let users = vec![user.clone()];
    save_users(&users).await.unwrap();
    let cookie = format!("user_id={}; Path=/; HttpOnly; SameSite=Strict", user.id);
    info!("Admin user {} created successfully", payload.username);
    (StatusCode::CREATED, [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())], Json(user)).into_response()
}

async fn login(ConnectInfo(addr): ConnectInfo<SocketAddr>, Json(payload): Json<LoginPayload>) -> Response {
    debug!("Login attempt for user: {} from {}", payload.username, addr.ip());
    let users = load_users().await.unwrap_or_default();
    let user = users.iter().find(|u| u.username == payload.username);
    if let Some(user) = user {
        if verify(&payload.password, &user.password_hash).unwrap_or(false) {
            let cookie = format!("user_id={}; Path=/; HttpOnly; SameSite=Strict", user.id);
            {
                let mut active = ACTIVE_USERS.get().unwrap().lock().await;
                active.insert(user.id.clone(), (user.clone(), addr.ip(), SystemTime::now()));
            }
            info!("User {} logged in successfully from {}", payload.username, addr.ip());
            return (StatusCode::OK, [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())], Json(user.clone())).into_response();
        } else {
            warn!("Invalid password for user {} from {}", payload.username, addr.ip());
        }
    } else {
        warn!("User {} not found from {}", payload.username, addr.ip());
    }
    (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid credentials"}))).into_response()
}

async fn current_user(headers: HeaderMap) -> Response {
    if let Some(user) = get_current_user(&headers).await {
        debug!("Current user: {}", user.username);
        (StatusCode::OK, Json(user)).into_response()
    } else {
        debug!("No current user found");
        (StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))).into_response()
    }
}

async fn logout(headers: HeaderMap, ConnectInfo(addr): ConnectInfo<SocketAddr>) -> Response {
    if let Some(user) = get_current_user(&headers).await {
        let mut active = ACTIVE_USERS.get().unwrap().lock().await;
        active.remove(&user.id);
        info!("User {} logged out from {}", user.username, addr.ip());
    }
    (StatusCode::OK, [(header::SET_COOKIE, "user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; HttpOnly; SameSite=Strict")]).into_response()
}

async fn active_users(headers: HeaderMap) -> Response {
    let user = get_current_user(&headers).await;
    if user.as_ref().map(|u| u.role != "admin").unwrap_or(true) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Admin required"}))).into_response();
    }
    let active = ACTIVE_USERS.get().unwrap().lock().await;
    let now = SystemTime::now();
    let list: Vec<_> = active.values()
        .filter(|(_, _, last_seen)| now.duration_since(*last_seen).unwrap_or(Duration::from_secs(0)) < Duration::from_secs(300)) // 5 minutes
        .map(|(u, ip, _)| json!({"username": &u.username, "ip": ip.to_string()}))
        .collect();
    (StatusCode::OK, Json(list)).into_response()
}

async fn create_user(headers: HeaderMap, Json(payload): Json<CreateUserPayload>) -> Response {
    info!("Creating user: {} with role: {}", payload.username, payload.role);
    let current_user = get_current_user(&headers).await;
    if current_user.as_ref().map(|u| u.role != "admin").unwrap_or(true) {
        warn!("Unauthorized attempt to create user by non-admin");
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Admin required"}))).into_response();
    }
    if payload.role != "admin" && payload.role != "readonly" {
        warn!("Invalid role: {}", payload.role);
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid role"}))).into_response();
    }
    let mut users = load_users().await.unwrap_or_default();
    let hash = hash(payload.password, DEFAULT_COST).unwrap();
    let user = User {
        id: generate_id(),
        username: payload.username.clone(),
        password_hash: hash,
        role: payload.role.clone(),
        settings: HashMap::new(),
    };
    users.push(user.clone());
    save_users(&users).await.unwrap();
    info!("User {} created successfully", payload.username);
    (StatusCode::CREATED, Json(user)).into_response()
}

async fn update_settings(headers: HeaderMap, Json(settings): Json<HashMap<String, String>>) -> Response {
    let mut user = get_current_user(&headers).await;
    if let Some(ref mut u) = user {
        u.settings = settings;
        let mut users = load_users().await.unwrap_or_default();
        if let Some(idx) = users.iter().position(|us| us.id == u.id) {
            users[idx] = u.clone();
            save_users(&users).await.unwrap();
            return (StatusCode::OK, Json(u.clone())).into_response();
        }
    }
    (StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))).into_response()
}

async fn change_password(headers: HeaderMap, Json(payload): Json<ChangePasswordPayload>) -> Response {
    let mut user = get_current_user(&headers).await;
    if let Some(ref mut u) = user {
        if verify(&payload.old_password, &u.password_hash).unwrap_or(false) {
            u.password_hash = hash(payload.new_password, DEFAULT_COST).unwrap();
            let mut users = load_users().await.unwrap_or_default();
            if let Some(idx) = users.iter().position(|us| us.id == u.id) {
                users[idx] = u.clone();
                save_users(&users).await.unwrap();
                return (StatusCode::OK, Json(json!({"success": true}))).into_response();
            }
        } else {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Wrong old password"}))).into_response();
        }
    }
    (StatusCode::UNAUTHORIZED, Json(json!({"error": "Not logged in"}))).into_response()
}
