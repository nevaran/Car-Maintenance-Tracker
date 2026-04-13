const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dataPath = path.join(__dirname, 'data', 'events.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadEvents() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (error) {
    return [];
  }
}

function saveEvents(events) {
  fs.writeFileSync(dataPath, JSON.stringify(events, null, 2), 'utf8');
}

app.get('/api/events', (req, res) => {
  res.json(loadEvents());
});

app.post('/api/events', (req, res) => {
  const events = loadEvents();
  const incoming = req.body;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const event = {
    id,
    title: incoming.title || 'New event',
    date: incoming.date,
    cost: Number(incoming.cost) || 0,
    repeat: incoming.repeat === 'yearly' ? 'yearly' : 'once',
    notes: incoming.notes || '',
    done: incoming.done === true || incoming.done === 'true' || false,
  };
  if (!event.date) {
    return res.status(400).json({ error: 'Date is required.' });
  }
  events.push(event);
  saveEvents(events);
  res.status(201).json(event);
});

app.put('/api/events/:id', (req, res) => {
  const events = loadEvents();
  const existing = events.find((item) => item.id === req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  const incoming = req.body;
  existing.title = incoming.title || existing.title;
  existing.date = incoming.date || existing.date;
  existing.cost = Number(incoming.cost) || 0;
  existing.repeat = incoming.repeat === 'yearly' ? 'yearly' : 'once';
  existing.notes = incoming.notes || existing.notes;
  existing.done = incoming.done === true || incoming.done === 'true' ? true : false;
  saveEvents(events);
  res.json(existing);
});

app.delete('/api/events/:id', (req, res) => {
  const events = loadEvents();
  const filtered = events.filter((item) => item.id !== req.params.id);
  if (filtered.length === events.length) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  saveEvents(filtered);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Car maintenance tracker running at http://localhost:${PORT}`);
});
