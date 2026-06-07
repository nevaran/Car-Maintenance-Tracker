// Main application entrypoint and HTTP routing setup for the tracker.
mod domain;
mod error;
mod features;
mod infra;

use axum::{
    extract::Path,
    extract::Json,
    http::{HeaderMap, HeaderName},
    routing::{get, post, put},
    Router,
    response::IntoResponse,
};
use tower_http::set_header::SetResponseHeaderLayer;
use axum::http::HeaderValue;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use domain::IpExtractor;
use features::{AuthHandlers, AuthService, EventHandlers, EventService, HealthHandlers, EmailService};
use features::auth::queries::GetCurrentUserQuery;
use infra::{
    FileEventRepository, FileUserRepository, FileAuditRepository, FileSessionRepository, ProxyAwareIpExtractor, TimestampIdGenerator, BackupManager,
};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .with_writer(std::io::stdout)
        .init();

    // Initialize infrastructure
    let user_repo = Arc::new(FileUserRepository::new("data/users.json"));
    let event_repo = Arc::new(FileEventRepository::new("data/events.json"));
    let audit_repo = Arc::new(FileAuditRepository::new("data/audit.json"));
    let session_repo = Arc::new(FileSessionRepository::new("data/sessions.json"));
    let id_gen = Arc::new(TimestampIdGenerator);
    let ip_extractor = Arc::new(ProxyAwareIpExtractor) as Arc<dyn IpExtractor>;

    // Initialize services
    let auth_service = Arc::new(AuthService::new(
        user_repo.clone(),
        audit_repo.clone(),
        session_repo.clone(),
        id_gen.clone(),
    ));
    if let Err(err) = auth_service.load_sessions().await {
        error!(error = ?err, "Failed to load persisted sessions");
    }
    let event_service = Arc::new(EventService::new(event_repo.clone(), id_gen));
    // Email service for sending upcoming event notifications
    let email_service = Arc::new(EmailService::new(event_repo.clone(), user_repo.clone()));

    // Background pruning task to cleanup expired sessions periodically
    {
        let auth_clone = auth_service.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(300)).await; // 5 minutes
                auth_clone.prune_expired_sessions().await;
            }
        });
    }

    // Background backup task to create daily snapshots of events file
    {
        let backup_manager = BackupManager::new("data/events.json");
        tokio::spawn(async move {
            tracing::info!("backup background task started");
            // Run backup immediately on startup (in case it's the first run of the day)
            let _ = backup_manager.backup_daily().await;
            loop {
                // Check every hour if we need to create a daily backup
                tokio::time::sleep(Duration::from_secs(3600)).await;
                match backup_manager.backup_daily().await {
                    Ok(_) => {
                        // Backup completed successfully or already exists for today
                    }
                    Err(e) => {
                        tracing::error!(error = ?e, "failed to perform daily backup");
                    }
                }
            }
        });
    }

    // Background email notification task: send notifications at startup and every 6 hours
    {
        let email_clone = email_service.clone();
        tokio::spawn(async move {
            tracing::info!("email background task started");
            if let Err(e) = email_clone.send_upcoming_notifications().await {
                tracing::error!(error = ?e, "failed to send initial email notifications");
            }

            loop {
                tokio::time::sleep(Duration::from_secs(60 * 60 * 6)).await; // 6 hours
                if let Err(e) = email_clone.send_upcoming_notifications().await {
                    tracing::error!(error = ?e, "failed to send scheduled email notifications");
                }
            }
        });
    }

    // Initialize handlers  
    let auth = Arc::new(AuthHandlers::new(auth_service.clone(), ip_extractor));
    let events = Arc::new(EventHandlers::new(event_service, auth_service.clone()));
    let health = Arc::new(HealthHandlers::new(user_repo));

    // Build router
    let auth_clone1 = auth.clone();
    let auth_clone2 = auth.clone();
    let auth_clone3 = auth.clone();
    let auth_clone4 = auth.clone();
    let auth_clone5 = auth.clone();
    let auth_clone6 = auth.clone();
    let auth_clone7 = auth.clone();
    let auth_clone8 = auth.clone();
    
    let events_clone1 = events.clone();
    let events_clone2 = events.clone();
    let events_clone3 = events.clone();
    let events_clone4 = events.clone();
    
    let health_clone1 = health.clone();

    let app = Router::new()
        .route(
            "/api/setup",
            get(move || {
                let h = health_clone1.clone();
                async move { h.check_setup().await }
            })
            .post(move |headers, body| {
                let a = auth_clone1.clone();
                async move { a.register_admin(headers, body).await }
            }),
        )
        .route(
            "/api/login",
            post(move |headers, body| {
                let a = auth_clone2.clone();
                async move { a.login(headers, body).await }
            }),
        )
        .route(
            "/api/logout",
            get(move |headers| {
                let a = auth_clone3.clone();
                async move { a.logout(headers).await }
            }),
        )
        .route(
            "/api/current_user",
            get(move |headers| {
                let a = auth_clone4.clone();
                async move { a.get_current_user(headers).await }
            }),
        )
        .route(
            "/api/active_users",
            get(move |headers| {
                let a = auth_clone5.clone();
                async move { a.list_active_sessions(headers).await }
            }),
        )
        .route(
            "/api/users",
            post(move |headers, body| {
                let a = auth_clone6.clone();
                async move { a.create_user(headers, body).await }
            }),
        )
        .route(
            "/api/settings",
            put(move |headers, body| {
                let a = auth_clone7.clone();
                async move { a.update_settings(headers, body).await }
            }),
        )
        .route(
            "/api/email/test",
            post(move |headers: HeaderMap, Json(payload): Json<serde_json::Value>| {
                let email_clone = email_service.clone();
                let auth_svc = auth_service.clone();
                async move {
                    let cookie = headers.get("cookie").and_then(|c| c.to_str().ok()).unwrap_or("").to_string();
                    if cookie.is_empty() {
                        return crate::error::AppError::Unauthorized("Not logged in".to_string()).into_response();
                    }
                    let query = GetCurrentUserQuery { cookie };
                    match auth_svc.get_current_user(query).await {
                        Ok(res) => {
                            if !res.user.is_admin() {
                                return crate::error::AppError::Forbidden("Admin required".to_string()).into_response();
                            }
                        }
                        Err(e) => return e.into_response(),
                    }

                    let mut recipients: Vec<String> = Vec::new();
                    if let Some(r) = payload.get("recipients") {
                        if r.is_string() {
                            recipients = r.as_str().unwrap_or("").split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                        } else if r.is_array() {
                            recipients = r.as_array().unwrap_or(&vec![]).iter().filter_map(|v| v.as_str().map(|s| s.trim().to_string())).filter(|s| !s.is_empty()).collect();
                        }
                    }

                    match email_clone.send_test_email(recipients).await {
                        Ok(_) => (axum::http::StatusCode::OK, axum::Json(serde_json::json!({"sent": true}))).into_response(),
                        Err(e) => e.into_response(),
                    }
                }
            }),
        )
        .route(
            "/api/change_password",
            put(move |headers, body| {
                let a = auth_clone8.clone();
                async move { a.change_password(headers, body).await }
            }),
        )
        .route(
            "/api/events",
            get(move |headers: HeaderMap| {
                let e = events_clone1.clone();
                async move { e.list_events(headers).await }
            })
            .post(move |headers: HeaderMap, body| {
                let e = events_clone2.clone();
                async move { e.create_event(headers, body).await }
            }),
        )
        .route(
            "/api/events/{id}",
            put(move |headers: HeaderMap, Path(id), body| {
                let e = events_clone3.clone();
                async move { e.update_event(headers, Path(id), body).await }
            })
            .delete(move |headers: HeaderMap, Path(id)| {
                let e = events_clone4.clone();
                async move { e.delete_event(headers, Path(id)).await }
            }),
        )
        .fallback_service(
            tower_http::services::ServeDir::new("public")
                .append_index_html_on_directories(true)
                .fallback(tower_http::services::ServeFile::new("public/index.html")),
        )
        .layer(tower_http::trace::TraceLayer::new_for_http())
        // Security headers
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("x-frame-options"),
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("x-xss-protection"),
            HeaderValue::from_static("1; mode=block"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ));

    let port = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(3000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Starting Car Maintenance Tracker on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to address");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
