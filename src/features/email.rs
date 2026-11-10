use crate::domain::{Event, IdGenerator};
use crate::error::Result;
use crate::infra::{EventRepository, UserRepository};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use lettre::message::{header::ContentType, Mailbox, Message, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, Tokio1Executor, AsyncTransport};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tracing::{info, warn, error};

pub struct EmailService {
    event_repo: Arc<dyn EventRepository>,
    user_repo: Arc<dyn UserRepository>,
    id_gen: Arc<dyn IdGenerator>,
}

impl EmailService {
    pub fn new(
        event_repo: Arc<dyn EventRepository>,
        user_repo: Arc<dyn UserRepository>,
        id_gen: Arc<dyn IdGenerator>,
    ) -> Self {
        Self { event_repo, user_repo, id_gen }
    }

    /// Determine the occurrence date of a yearly series entry for `year`,
    /// mirroring the frontend JS rollover (Feb 29 → Mar 1 in non-leap years).
    fn yearly_candidate_date(year: i32, month: u32, day: u32) -> Option<NaiveDate> {
        match NaiveDate::from_ymd_opt(year, month, day) {
            Some(d) => Some(d),
            None => NaiveDate::from_ymd_opt(year, month + 1, 1),
        }
    }

    /// Materialize persisted rows for yearly series entries that are due within
    /// the notification window but have no stored row yet.
    ///
    /// Yearly recurrences are generated client-side (see getEventOccurrences in
    /// app.js) and only persisted when the user edits or completes a specific
    /// year (an "override" row with origin_id + created_year). Without this step
    /// the scheduled notification job would only ever see the base row dated in
    /// the original year, so recurring events would never be notified again in
    /// later years. Rows are materialized lazily (only when entering the window)
    /// and carried via email_sent so each year notifies exactly once.
    fn materialize_due_yearly_occurrences(
        events: &[Event],
        today: NaiveDate,
        yearly_threshold: i64,
        id_gen: &dyn IdGenerator,
    ) -> Vec<Event> {
        let mut series_heads: HashMap<&str, &Event> = HashMap::new();
        for e in events.iter().filter(|e| e.origin_id.is_none() && e.repeat == "yearly") {
            series_heads.insert(e.id.as_str(), e);
        }

        // Per-year overrides already persisted by user interactions.
        let mut overridden_years: HashSet<(String, i32)> = HashSet::new();
        for e in events.iter() {
            if let Some(pid) = e.origin_id.as_deref() {
                if series_heads.contains_key(pid) {
                    overridden_years.insert((pid.to_string(), e.date.year()));
                }
            }
        }

        let horizon_year = (today + Duration::days(yearly_threshold)).year();
        let mut rows: Vec<Event> = Vec::new();
        for (&head_id, base) in series_heads.iter() {
            let base_year = base.date.year();
            for year in (base_year + 1)..=horizon_year {
                if overridden_years.contains(&(head_id.to_string(), year)) {
                    continue;
                }
                // Respect the user-defined series end year (mirrors the frontend).
                if base.end_date.map(|end| year > end.year()).unwrap_or(false) {
                    continue;
                }
                let Some(date) = Self::yearly_candidate_date(year, base.date.month(), base.date.day()) else {
                    continue;
                };
                let days_until = (date - today).num_days();
                if days_until < 0 || days_until > yearly_threshold {
                    continue; // Not due yet; stays virtual until it enters the window.
                }
                info!(base_id = %head_id, year = year, date = %date, "materializing yearly occurrence for notification");
                // Same shape the frontend creates when toggling a generated
                // instance: empty title/repeat, copied cost/notes, origin link.
                rows.push(Event {
                    id: id_gen.generate(),
                    title: String::new(),
                    date,
                    end_date: None,
                    email_sent: false,
                    cost: base.cost,
                    repeat: String::new(),
                    notes: base.notes.clone(),
                    done: false,
                    origin_id: Some(head_id.to_string()),
                    created_year: Some(year as u16),
                });
            }
        }
        rows
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

        // Load events and find upcoming events that haven't been emailed.
        let mut events = self.event_repo.load_all().await?;
        info!(event_count = events.len(), "loaded events from repository");
        let today = Utc::now().date_naive();

        let users = self.user_repo.load_all().await?;
        let mut onetime_threshold = 7;
        let mut yearly_threshold = 7;
        let mut recipients: Vec<String> = Vec::new();
        for u in users.iter().filter(|u| u.is_admin()) {
            if let Some(val) = u.settings.get("notification_threshold_onetime") {
                if let Ok(days) = val.parse::<i64>() {
                    onetime_threshold = days.max(1);
                }
            }
            if let Some(val) = u.settings.get("notification_threshold_yearly") {
                if let Ok(days) = val.parse::<i64>() {
                    yearly_threshold = days.max(1);
                }
            }
            if let Some(val) = u.settings.get("notification_recipients") {
                for r in val.split(',') {
                    let rtrim = r.trim();
                    if !rtrim.is_empty() {
                        recipients.push(rtrim.to_string());
                    }
                }
            }
        }

        info!(
            admin_count = users.iter().filter(|u| u.is_admin()).count(),
            one_time_window_days = onetime_threshold,
            yearly_window_days = yearly_threshold,
            recipient_count = recipients.len(),
            "using configured notification windows"
        );

        // Generate notification rows for recurring yearly entries that are due
        // but not yet persisted (see materialize_due_yearly_occurrences).
        let new_rows = Self::materialize_due_yearly_occurrences(&events, today, yearly_threshold, self.id_gen.as_ref());
        events.extend(new_rows);

        // Titles of override rows come from their series head (overrides store
        // an empty title by design).
        let mut parent_title: HashMap<String, String> = HashMap::new();
        for e in events.iter().filter(|e| e.origin_id.is_none()) {
            parent_title.insert(e.id.clone(), e.title.clone());
        }

        let parent_yearly: HashSet<String> = events.iter()
            .filter(|e| e.origin_id.is_none() && e.repeat == "yearly")
            .map(|e| e.id.clone())
            .collect();

        let mut pending: Vec<&mut crate::domain::Event> = events.iter_mut()
            .filter(|e| {
                if e.email_sent || e.done {
                    return false;
                }
                let days_until = (e.date - today).num_days();
                if days_until < 0 {
                    return false;
                }
                // Yearly series entries whose per-year override was persisted
                // by the frontend carry an empty repeat; classify via the parent.
                let is_yearly = e.repeat == "yearly"
                    || e.origin_id.as_deref().map(|pid| parent_yearly.contains(pid)).unwrap_or(false);
                if is_yearly {
                    days_until <= yearly_threshold
                } else {
                    days_until <= onetime_threshold
                }
            })
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
            let display_title = if e.title.is_empty() {
                e.origin_id
                    .as_deref()
                    .and_then(|pid| parent_title.get(pid))
                    .map(|t| t.as_str())
                    .unwrap_or("")
            } else {
                e.title.as_str()
            };
            html.push_str(&format!(
                "<tr><td style=\"{}\" bgcolor=\"{}\">{}</td><td style=\"{}\" bgcolor=\"{}\">{}</td><td style=\"{}\" bgcolor=\"{}\">{:.2}</td><td style=\"{}\" bgcolor=\"{}\">{}</td></tr>",
                td_style,
                row_color,
                e.date.format("%Y-%m-%d"),
                td_style,
                row_color,
                html_escape::encode_text(display_title),
                td_style,
                row_color,
                e.cost,
                td_style,
                row_color,
                html_escape::encode_text(&e.notes)
            ));
        }
        html.push_str("</tbody></table></body></html>");

        if recipients.is_empty() {
            info!("No notification recipients configured for admins; skipping email send");
            return Ok(());
        }

        info!(admin_count = users.iter().filter(|u| u.is_admin()).count(), recipients_count = recipients.len(), "discovered admin recipients");

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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct CountingIdGenerator(AtomicU64);
    impl IdGenerator for CountingIdGenerator {
        fn generate(&self) -> String {
            format!("test-{}", self.0.fetch_add(1, Ordering::Relaxed))
        }
    }

    fn g() -> CountingIdGenerator {
        CountingIdGenerator(AtomicU64::new(0))
    }

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).expect("valid date")
    }

    fn head(id: &str, y: i32, m: u32, d: u32, done: bool) -> Event {
        Event {
            id: id.to_string(),
            title: format!("title-{}", id),
            date: date(y, m, d),
            end_date: None,
            email_sent: false,
            cost: 50.0,
            repeat: "yearly".to_string(),
            notes: String::new(),
            done,
            origin_id: None,
            created_year: Some(y as u16),
        }
    }

    fn override_row(parent: &str, y: i32, m: u32, d: u32, email_sent: bool, done: bool) -> Event {
        Event {
            id: format!("ovr-{}-{}", y, m),
            title: String::new(),
            date: date(y, m, d),
            end_date: None,
            email_sent,
            cost: 10.0,
            repeat: String::new(),
            notes: String::new(),
            done,
            origin_id: Some(parent.to_string()),
            created_year: Some(y as u16),
        }
    }

    fn today(y: i32, m: u32, d: u32) -> NaiveDate {
        date(y, m, d)
    }

    #[test]
    fn done_base_year_still_notifies_next_year() {
        // The user's vignette case: base dated 2025-11-10, done, never emailed.
        let events = vec![head("vinetka", 2025, 11, 10, true)];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 10), 2, &g());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].origin_id.as_deref(), Some("vinetka"));
        assert_eq!(rows[0].date, date(2026, 11, 10));
        assert!(!rows[0].done);
        assert!(!rows[0].email_sent);
        assert_eq!(rows[0].created_year, Some(2026));
    }

    #[test]
    fn entry_inside_window_is_materialized() {
        let events = vec![head("vinetka", 2025, 11, 10, true)];
        // 2 days before the 2026 occurrence, within the threshold.
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 8), 2, &g());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, date(2026, 11, 10));
    }

    #[test]
    fn entry_outside_window_stays_virtual() {
        let events = vec![head("vinetka", 2025, 11, 10, true)];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 6, 1), 2, &g());
        assert!(rows.is_empty());
    }

    #[test]
    fn existing_override_is_not_duplicated() {
        let events = vec![
            head("vinetka", 2025, 11, 10, true),
            override_row("vinetka", 2026, 11, 10, false, true), // user already toggled 2026
        ];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 10), 2, &g());
        assert!(rows.is_empty());
    }

    #[test]
    fn materially_emailed_year_is_not_recreated() {
        let events = vec![
            head("vinetka", 2025, 11, 10, true),
            override_row("vinetka", 2026, 11, 10, true, false), // emailed once
        ];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 10), 2, &g());
        assert!(rows.is_empty());
    }

    #[test]
    fn end_date_caps_generation() {
        let mut base = head("tu", 2025, 11, 10, true);
        base.end_date = Some(date(2026, 12, 31));
        let events = vec![base];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2027, 11, 10), 2, &g());
        assert!(rows.is_empty()); // 2027 occurrence is past the series end year
    }

    #[test]
    fn feb29_rolls_to_mar1_like_frontend() {
        let events = vec![head("leap", 2024, 2, 29, true)];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2025, 2, 28), 2, &g());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, date(2025, 3, 1));
    }

    #[test]
    fn one_time_events_never_materialize() {
        let mut one = head("once", 2025, 11, 10, true);
        one.repeat = "once".to_string();
        let events = vec![one];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 10), 2, &g());
        assert!(rows.is_empty());
    }

    #[test]
    fn base_year_row_is_not_duplicated() {
        // A base dated this year flows through the normal filter; expansion
        // starts at base year + 1.
        let events = vec![head("thisyear", 2026, 11, 10, false)];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 10), 2, &g());
        assert!(rows.is_empty());
    }

    #[test]
    fn threshold_horizon_crosses_year_boundary() {
        let events = vec![head("ny", 2025, 1, 1, true)];
        // Dec 31 + threshold 2 sees the Jan 1 occurrence of the next year.
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 12, 31), 2, &g());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, date(2027, 1, 1));
    }

    #[test]
    fn real_dataset_2026_11_10() {
        // Production data as of 2026-11-10. Three events completed by the user
        // (tire swap, rim purchase, a 4-installment occurrence toggled done on
        // its day) plus the vignette series: base dated 2025-11-10 and marked
        // done in that year, 2026 instance never persisted. Only the vignette's
        // 2026 occurrence should materialize for notification.
        let done_once = |id: &str| Event {
            id: id.to_string(),
            title: id.to_string(),
            date: date(2026, 11, 7),
            end_date: None,
            email_sent: false,
            cost: 49.0,
            repeat: "once".to_string(),
            notes: String::new(),
            done: true,
            origin_id: None,
            created_year: Some(2026),
        };
        let events = vec![
            done_once("tyre-swap-winter"),
            Event { cost: 200.0, ..done_once("new-rims") },
            Event {
                id: "installment-0".to_string(),
                date: date(2026, 11, 10),
                cost: 740.0,
                done: true,
                origin_id: Some("1776708664849-1".to_string()),
                ..done_once("parent-quota")
            },
            head("1776698030854-2", 2025, 11, 10, true) // Виньетка series, done in 2025
        ];
        let rows = EmailService::materialize_due_yearly_occurrences(&events, today(2026, 11, 10), 2, &g());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].origin_id.as_deref(), Some("1776698030854-2"));
        assert_eq!(rows[0].date, date(2026, 11, 10));
        assert_eq!(rows[0].cost, 50.0);
        assert!(!rows[0].done);
        assert!(!rows[0].email_sent);
    }

    #[test]
    fn yearly_candidate_date_matches_frontend_rollover() {
        assert_eq!(EmailService::yearly_candidate_date(2025, 2, 29), Some(date(2025, 3, 1)));
        assert_eq!(EmailService::yearly_candidate_date(2024, 2, 29), Some(date(2024, 2, 29)));
        assert_eq!(EmailService::yearly_candidate_date(2026, 11, 10), Some(date(2026, 11, 10)));
    }
}
