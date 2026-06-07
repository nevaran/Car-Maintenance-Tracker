// Feature module exports for application business domains.
pub mod auth;
pub mod events;
pub mod health;
pub mod email;

pub use auth::{AuthHandlers, AuthService};
pub use events::{EventHandlers, EventService};
pub use health::HealthHandlers;
pub use email::EmailService;
