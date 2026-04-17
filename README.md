# Car Maintenance Tracker

A modern browser-based car maintenance tracker with server-side data persistence, an interactive calendar, editable events, and yearly expense statistics in euros.

## Run locally

1. Install Rust and Cargo if needed: https://rustup.rs/
2. Build and run the server:

```bash
cargo run --release
```

3. Open `http://localhost:3000` in your browser.

## Run in Docker

Build the container:

```bash
docker build -t car-maintenance-tracker .
```

Run the container:

```bash
docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" car-maintenance-tracker
```

Then open `http://localhost:3000`.

### Run with Docker Compose

```bash
docker compose up --build
```
or the longer but better way
```bash
docker compose build
docker compose up -d
```

The `data` directory is mounted so event data persists between runs.

## Features

- Server-side event storage in `data/events.json`
- Calendar view with clickable days
- Add, edit, delete events
- One-time or yearly repeating events
- Built-in UI localization with English and Bulgarian support
- Top-bar locale selector for switching languages on the fly
- Device-aware desktop/mobile stylesheet loading through `public/device-detect.js`
- Side panel showing the year's events
- Yearly expense statistics in EUR
- ISO date format everywhere
