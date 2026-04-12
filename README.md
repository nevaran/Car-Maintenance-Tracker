# Car Maintenance Tracker

A modern browser-based car maintenance tracker with server-side data persistence, an interactive calendar, editable events, and yearly expense statistics in euros.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open `http://localhost:3000` in your browser.

## Run in Docker

If you do not have Node.js installed locally, use Docker instead.

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

The data directory is mounted into the container so event data persists between runs.

## Features

- Server-side event storage in `data/events.json`
- Calendar view with clickable days
- Add, edit, delete events
- One-time or yearly repeating events
- Side panel showing the past 6 months and next 6 months
- Yearly expense statistics in EUR
- ISO date format everywhere
