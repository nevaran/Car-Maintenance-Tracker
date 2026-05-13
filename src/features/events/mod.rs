// Event management feature module composed of commands, handlers, queries, and service logic.
pub mod commands;
pub mod handlers;
pub mod queries;
pub mod service;

pub use handlers::EventHandlers;
pub use service::EventService;
