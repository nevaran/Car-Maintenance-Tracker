mod domain;
mod error;
mod features;
mod infra;

use axum::{
    extract::Path,
    http::{HeaderMap, HeaderName},
    routing::{get, post, put},
    Router,
};
use tower_http::set_header::{SetResponseHeader, SetResponseHeaderLayer};
use axum::http::HeaderValue;
use std::net::SocketAddr;
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::EnvFilter;

use domain::IpExtractor;
use features::{AuthHandlers, AuthService, EventHandlers, EventService, HealthHandlers};
use infra::{
    FileEventRepository, FileUserRepository, FileAuditRepository, ProxyAwareIpExtractor, TimestampIdGenerator,
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
    let id_gen = Arc::new(TimestampIdGenerator);
    let ip_extractor = Arc::new(ProxyAwareIpExtractor) as Arc<dyn IpExtractor>;

    // Initialize services
    let auth_service = Arc::new(AuthService::new(user_repo.clone(), audit_repo.clone(), id_gen.clone()));
    let event_service = Arc::new(EventService::new(event_repo, id_gen));

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
            .post(move |body| {
                let a = auth_clone1.clone();
                async move { a.register_admin(body).await }
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
