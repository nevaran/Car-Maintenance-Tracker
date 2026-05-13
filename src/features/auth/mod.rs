// Authentication feature module composing commands, queries, handlers, and service logic.
pub mod commands;
pub mod handlers;
pub mod queries;
pub mod service;

pub use handlers::AuthHandlers;
pub use service::AuthService;
