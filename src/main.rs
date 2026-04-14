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

const DATA_PATH: &str = "data/events.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Event {
    id: String,
    title: String,
    date: String,
    cost: f64,
    repeat: String,
    notes: String,
    done: bool,
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
}

#[tokio::main]
async fn main() {
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
        );

    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    println!("Car maintenance tracker running at http://{}", addr);
    let listener = TcpListener::bind(addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, app)
        .await
        .expect("server failed");
}

async fn get_events() -> impl IntoResponse {
    match load_events().await {
        Ok(events) => (StatusCode::OK, Json(events)).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<Event>::new())).into_response(),
    }
}

async fn create_event(Json(input): Json<InputEvent>) -> impl IntoResponse {
    let date = match input.date {
        Some(date) if !date.trim().is_empty() => date,
        _ => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Date is required."}))).into_response(),
    };

    let mut events = match load_events().await {
        Ok(events) => events,
        Err(_) => Vec::new(),
    };

    let event = Event {
        id: generate_id(),
        title: input
            .title
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "New event".to_string()),
        date,
        cost: input.cost.unwrap_or(0.0),
        repeat: match input.repeat.as_deref() {
            Some("yearly") => "yearly".to_string(),
            _ => "once".to_string(),
        },
        notes: input.notes.unwrap_or_default(),
        done: input.done.unwrap_or(false),
    };

    events.push(event.clone());
    if let Err(_) = save_events(&events).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Could not save event."})),
        )
            .into_response();
    }

    (StatusCode::CREATED, Json(event)).into_response()
}

async fn update_event(
    Path(id): Path<String>,
    Json(input): Json<InputEvent>,
) -> impl IntoResponse {
    let mut events = match load_events().await {
        Ok(events) => events,
        Err(_) => Vec::new(),
    };

    let existing = match events.iter_mut().find(|event| event.id == id) {
        Some(existing) => existing,
        None => return (StatusCode::NOT_FOUND, Json(json!({"error": "Event not found."}))).into_response(),
    };

    existing.title = input
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| existing.title.clone());
    existing.date = input.date.unwrap_or_else(|| existing.date.clone());
    existing.cost = input.cost.unwrap_or(0.0);
    existing.repeat = match input.repeat.as_deref() {
        Some("yearly") => "yearly".to_string(),
        _ => "once".to_string(),
    };
    existing.notes = input.notes.unwrap_or_else(|| existing.notes.clone());
    existing.done = input.done.unwrap_or(false);
    let response = existing.clone();

    if let Err(_) = save_events(&events).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Could not save event."})),
        )
            .into_response();
    }

    (StatusCode::OK, Json(response)).into_response()
}

async fn delete_event(Path(id): Path<String>) -> impl IntoResponse {
    let mut events = match load_events().await {
        Ok(events) => events,
        Err(_) => Vec::new(),
    };

    let original_len = events.len();
    events.retain(|event| event.id != id);

    if events.len() == original_len {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Event not found."}))).into_response();
    }

    if let Err(_) = save_events(&events).await {
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
        return Ok(Vec::new());
    }

    let contents = tokio::fs::read_to_string(path).await?;
    let events = if contents.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(&contents).unwrap_or_else(|_| Vec::new())
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
    tokio::fs::write(path, data).await
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
