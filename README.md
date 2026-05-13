# Car Maintenance Tracker

A browser-based car maintenance tracker with a Rust/Axum backend, persistent JSON storage, interactive calendar UI, timeline view, user authentication, and yearly expense statistics. Features comprehensive security measures including rate limiting, audit logging, and role-based authorization.

The app is extremely lightweight tested as a docker container with a resource usage:
- ~2MiB RAM usage with an empty project, and initial user (admin)
- ~5MiB RAM usage with 20 events of various types and information, and two users (admin and read-only)

## Overview

This project includes:

- A Rust server using `axum` to serve the frontend and provide REST APIs
- Static frontend in `public/` with a calendar, timeline, stats panel, modals, and locale switching
- Persistent event storage in `data/events.json`
- User credentials stored in `data/users.json` after initial admin setup
- Support for one-time and yearly recurring events
- Event completion tracking and calendar markers
- Advanced search with reverse search capability (prefix with '!' to exclude matches)
- Locale switcher for different languages
- Admin setup, login, logout, change password, and create read-only users

## Prerequisites

- Rust and Cargo: https://rustup.rs/
- Optional: Docker and Docker Compose for containerized deployment

## Run locally

1. Install Rust and Cargo.
2. Start the server from the project root:

```bash
cargo run --release
```

3. Open your browser to:

```text
http://localhost:3000
```

4. Create the first admin user via the setup modal, then log in to manage events.

### Optional port override

```bash
PORT=8080 cargo run --release
```

## Run in Docker

Build the container:

```bash
docker build -t car-maintenance-tracker .
```

Run the container with persistent data:

```bash
docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" car-maintenance-tracker
```

Then open `http://localhost:3000`.

## Run with Docker Compose (recommended)

```bash
docker compose build
docker compose up -d
```

## Clean docker builder cache if a lot of builds were made

```bash
docker builder prune
```

The `data` directory is mounted so event and user data persist between restarts.

## Features

- Rust/Axum backend with JSON-based persistence
- Static frontend served from `public/`
- Monthly calendar with event markers and clickable days
- Event modal for add/edit/delete operations
- Mark events as complete and keep track of done state
- Recurring yearly events with optional repeat metadata
- Timeline and yearly expense statistics panels
- Advanced search functionality with reverse search (prefix with '!' to exclude matches)
- Locale switching between different languages
- User authentication with admin setup and read-only user support
- Password change flow for logged-in users
- Account lockout after failed login attempts
- Active users monitoring (admin-only feature showing users active in last 5 minutes)
- Rate limiting on login attempts
- Comprehensive audit logging
- Security headers (XSS protection, clickjacking prevention, etc.)
- Role-based authorization (admin vs read-only users)
- Input validation and date bounds checking
- Desktop and Mobile variants of the web interface

## Security Features

The application implements comprehensive security measures:

- **Authentication & Authorization**: Session-based authentication with role-based access control (admin vs read-only users)
- **Rate Limiting**: Login attempts are rate-limited to 5 attempts per minute
- **Account Lockout**: Accounts are locked for 15 minutes after 5 consecutive failed login attempts
- **Audit Logging**: All authentication events are logged with timestamps, IP addresses, and user details
- **Input Validation**: Date bounds validation (1900-2100) and comprehensive input sanitization
- **Security Headers**: XSS protection, clickjacking prevention, MIME sniffing protection, and referrer policy controls
- **Session Security**: Enhanced cookie validation and session management
- **Race Condition Protection**: File-level locking prevents concurrent setup requests

## Data files

- `data/events.json` — stores maintenance events
- `data/users.json` — stores user accounts and settings
- `data/audit.json` — stores all logins of users with event-type details (raw view only)
- `data/login_attempts.json` — stores user information about account state (raw view only)

## Notes

- The server falls back to `public/index.html` for client-side routing.
- Localization bundles are loaded from `public/locales/`.
- The app is designed to work without a frontend build step; static assets are served directly.

## Roadmap

### Add email notification system
### Improve security, specifically in the users data
### Code refactoring