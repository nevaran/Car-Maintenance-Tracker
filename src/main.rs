use axum::extract::{Json, Path};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{debug, error, info};
use tracing_subscriber::{fmt, EnvFilter};

const DATA_PATH: &str = "data/events.json";

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
    let listener = TcpListener::bind(addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, app)
        .await
        .expect("server failed");
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

async fn create_event(Json(input): Json<InputEvent>) -> impl IntoResponse {
    debug!(?input, "handling create_event");
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
    Path(id): Path<String>,
    Json(input): Json<InputEvent>,
) -> impl IntoResponse {
    debug!(event_id = %id, ?input, "handling update_event");
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

async fn delete_event(Path(id): Path<String>) -> impl IntoResponse {
    info!(event_id = %id, "handling delete_event");
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
