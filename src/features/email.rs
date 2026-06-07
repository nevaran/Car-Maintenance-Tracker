use crate::error::Result;
use crate::infra::{EventRepository, UserRepository};
use chrono::{Utc, Duration};
use lettre::message::{header::ContentType, Mailbox, Message, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, Tokio1Executor, AsyncTransport};
use std::sync::Arc;
use tracing::{info, warn, error};

pub struct EmailService {
    event_repo: Arc<dyn EventRepository>,
    user_repo: Arc<dyn UserRepository>,
}

impl EmailService {
    pub fn new(event_repo: Arc<dyn EventRepository>, user_repo: Arc<dyn UserRepository>) -> Self {
        Self { event_repo, user_repo }
    }

    pub async fn send_upcoming_notifications(&self) -> Result<()> {
        info!("send_upcoming_notifications invoked");
        // Load configuration from env
        let sender = std::env::var("SMTP_SENDER").unwrap_or_default();
        if sender.is_empty() || sender == "sender@example.com" {
            info!("SMTP sender not configured or set to placeholder; skipping email send");
            return Ok(());
        }

        let host = std::env::var("SMTP_HOST").unwrap_or_default();
        let port: u16 = std::env::var("SMTP_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(587);
        let username = std::env::var("SMTP_USERNAME").unwrap_or_default();
        let password = std::env::var("SMTP_PASSWORD").unwrap_or_default();

        if host.is_empty() {
            warn!("SMTP_HOST not set; skipping email send");
            return Ok(());
        }

        // Build SMTP transport
        let creds = Credentials::new(username.clone(), password.clone());
        let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)
            .map_err(|e| crate::error::AppError::InternalError(format!("smtp relay error: {}", e)))?
            .port(port)
            .credentials(creds)
            .build();

        // Load events and find upcoming within 7 days that haven't been emailed
        let mut events = self.event_repo.load_all().await?;
        info!(event_count = events.len(), "loaded events from repository");
        let today = Utc::now().date_naive();
        let cutoff = today + Duration::days(7);

        let mut pending: Vec<&mut crate::domain::Event> = events.iter_mut()
            .filter(|e| !e.email_sent && !e.done && e.date >= today && e.date <= cutoff)
            .collect();

        if pending.is_empty() {
            info!("No pending events to notify");
            return Ok(());
        }

        // Build HTML table grouped by date
        pending.sort_by_key(|e| e.date);
        let table_style = "border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;";
        let header_style = "background-color:#2563eb;color:#ffffff;border:1px solid #d1d5db;padding:10px;text-align:left;font-weight:700;";
        let cell_style = "border:1px solid #d1d5db;padding:10px;text-align:left;";
        let mut html = String::from("<html><body><h3>Upcoming events</h3><table style=\"");
        html.push_str(table_style);
        html.push_str("\"><thead><tr>");
        html.push_str(&format!("<th style=\"{}\">Date</th>", header_style));
        html.push_str(&format!("<th style=\"{}\">Title</th>", header_style));
        html.push_str(&format!("<th style=\"{}\">Cost</th>", header_style));
        html.push_str(&format!("<th style=\"{}\">Notes</th>", header_style));
        html.push_str("</tr></thead><tbody>");
        for (index, e) in pending.iter().enumerate() {
            let row_color = if index % 2 == 0 { "#ffffff" } else { "#f8fafc" };
            let td_style = format!("{}background-color:{};", cell_style, row_color);
            html.push_str(&format!(
                "<tr><td style=\"{}\" bgcolor=\"{}\">{}</td><td style=\"{}\" bgcolor=\"{}\">{}</td><td style=\"{}\" bgcolor=\"{}\">{:.2}</td><td style=\"{}\" bgcolor=\"{}\">{}</td></tr>",
                td_style,
                row_color,
                e.date.format("%Y-%m-%d"),
                td_style,
                row_color,
                html_escape::encode_text(&e.title),
                td_style,
                row_color,
                e.cost,
                td_style,
                row_color,
                html_escape::encode_text(&e.notes)
            ));
        }
        html.push_str("</tbody></table></body></html>");

        // Find admin recipients from user settings
        let users = self.user_repo.load_all().await?;
        let mut recipients: Vec<String> = Vec::new();
        for u in users.iter().filter(|u| u.is_admin()) {
            if let Some(val) = u.settings.get("notification_recipients") {
                for r in val.split(',') {
                    let rtrim = r.trim();
                    if !rtrim.is_empty() {
                        recipients.push(rtrim.to_string());
                    }
                }
            }
        }

        info!(admin_count = users.iter().filter(|u| u.is_admin()).count(), recipients_count = recipients.len(), "discovered admin recipients");

        if recipients.is_empty() {
            info!("No notification recipients configured for admins; skipping email send");
            return Ok(());
        }

        // Build message
        let mut msg_builder = Message::builder()
            .from(sender.parse::<Mailbox>().map_err(|_| crate::error::AppError::InternalError("Invalid sender email".to_string()))?);

        for r in &recipients {
            msg_builder = msg_builder.to(r.parse::<Mailbox>().map_err(|_| crate::error::AppError::InternalError("Invalid recipient email".to_string()))?);
        }

        let message = msg_builder
            .subject("CMT - Upcoming events notification")
            .singlepart(SinglePart::builder()
                .header(ContentType::TEXT_HTML)
                .body(html))
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to build message: {}", e)))?;

        // Send email
        match mailer.send(message).await {
            Ok(_) => {
                info!("Notification email sent to {} recipients", recipients.len());
                // Mark events as sent and persist
                for e in pending.iter_mut() {
                    e.email_sent = true;
                }
                self.event_repo.save_all(&events).await?;
                Ok(())
            }
            Err(err) => {
                error!(error = ?err, "Failed to send notification email");
                Err(crate::error::AppError::InternalError("Failed to send emails".to_string()))
            }
        }
    }

    pub async fn send_test_email(&self, recipients: Vec<String>) -> Result<()> {
        let sender = std::env::var("SMTP_SENDER").unwrap_or_default();
        if sender.is_empty() || sender == "sender@example.com" {
            info!("SMTP sender not configured or set to placeholder; skipping test email");
            return Ok(());
        }

        let host = std::env::var("SMTP_HOST").unwrap_or_default();
        let port: u16 = std::env::var("SMTP_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(587);
        let username = std::env::var("SMTP_USERNAME").unwrap_or_default();
        let password = std::env::var("SMTP_PASSWORD").unwrap_or_default();

        if host.is_empty() {
            warn!("SMTP_HOST not set; skipping test email");
            return Ok(());
        }

        let creds = Credentials::new(username.clone(), password.clone());
        let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)
            .map_err(|e| crate::error::AppError::InternalError(format!("smtp relay error: {}", e)))?
            .port(port)
            .credentials(creds)
            .build();

        if recipients.is_empty() {
            info!("No recipients provided for test email");
            return Ok(());
        }

        let mut msg_builder = Message::builder()
            .from(sender.parse::<Mailbox>().map_err(|_| crate::error::AppError::InternalError("Invalid sender email".to_string()))?);

        for r in &recipients {
            msg_builder = msg_builder.to(r.parse::<Mailbox>().map_err(|_| crate::error::AppError::InternalError("Invalid recipient email".to_string()))?);
        }

        let html = "<p>This is a test email from Car Maintenance Tracker. If you received this, SMTP is configured correctly.</p>".to_string();

        let message = msg_builder
            .subject("Test email from Car Maintenance Tracker")
            .singlepart(SinglePart::builder()
                .header(ContentType::TEXT_HTML)
                .body(html))
            .map_err(|e| crate::error::AppError::InternalError(format!("Failed to build message: {}", e)))?;

        match mailer.send(message).await {
            Ok(_) => {
                info!("Test email sent to {} recipients", recipients.len());
                Ok(())
            }
            Err(err) => {
                error!(error = ?err, "Failed to send test email");
                Err(crate::error::AppError::InternalError("Failed to send test email".to_string()))
            }
        }
    }
}
