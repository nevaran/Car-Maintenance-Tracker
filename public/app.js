const state = {
  events: [],
  currentDate: new Date(),
  timelinePastMonths: 3,
  timelineFutureMonths: 6,
};

const dom = {
  calendarGrid: document.getElementById('calendar-grid'),
  monthLabel: document.getElementById('month-label'),
  todayLabel: document.getElementById('today-label'),
  monthEventsCount: document.getElementById('month-events-count'),
  monthCostTotal: document.getElementById('month-cost-total'),
  eventList: document.getElementById('event-list'),
  statsYear: document.getElementById('stats-year'),
  yearTotal: document.getElementById('year-total'),
  yearEvents: document.getElementById('year-events'),
  yearAverage: document.getElementById('year-average'),
  monthlyBars: document.getElementById('monthly-bars'),
  form: document.getElementById('event-form'),
  title: document.getElementById('title'),
  date: document.getElementById('date'),
  cost: document.getElementById('cost'),
  repeat: document.getElementById('repeat'),
  notes: document.getElementById('notes'),
  done: document.getElementById('done'),
  eventId: document.getElementById('event-id'),
  clearForm: document.getElementById('clear-form'),
  yearSelect: document.getElementById('year-select'),
  monthSelect: document.getElementById('month-select'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  timelineRangeLabel: document.getElementById('timeline-range-label'),
  timelinePastMonths: document.getElementById('timeline-past-months'),
  timelineFutureMonths: document.getElementById('timeline-future-months'),
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISODate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatMoney(amount) {
  return `€${amount.toFixed(2)}`;
}

function startOfWeek(date) {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const copy = new Date(date);
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function buildCalendarDays(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = startOfWeek(firstOfMonth);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + i);
    days.push(cellDate);
  }
  return days;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isEventPast(eventDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate);
  event.setHours(0, 0, 0, 0);
  return event < today;
}

function isEventWithinLastWeek(eventDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate);
  event.setHours(0, 0, 0, 0);
  const oneWeekFromNow = new Date(today);
  oneWeekFromNow.setDate(today.getDate() + 7);
  return event >= today && event <= oneWeekFromNow;
}

function checkAndResetYearlyEvents() {
  const currentYear = new Date().getFullYear();
  let needsUpdate = false;

  state.events.forEach(event => {
    if (event.repeat === 'yearly' && event.done === true) {
      const eventDate = parseISODate(event.date);
      // If the event is marked as done but we're in a different year than when it was marked done
      // or if it's a new year and the event hasn't occurred yet this year
      if (eventDate.getFullYear() < currentYear) {
        event.done = false;
        needsUpdate = true;
      }
    }
  });

  if (needsUpdate) {
    // Save all events to persist the changes
    Promise.all(state.events.map(event => saveEvent(event))).then(() => {
      renderApp();
    });
  }
}

function getEventOccurrences(event, startDate, endDate) {
  const occurrences = [];
  const baseDate = parseISODate(event.date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (event.repeat === 'yearly') {
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      const candidate = new Date(year, baseDate.getMonth(), baseDate.getDate());
      if (candidate >= start && candidate <= end) {
        occurrences.push({ ...event, occurrence: formatISO(candidate), dateObj: candidate });
      }
    }
  } else {
    if (baseDate >= start && baseDate <= end) {
      occurrences.push({ ...event, occurrence: formatISO(baseDate), dateObj: baseDate });
    }
  }
  return occurrences;
}

function getMonthEvents(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return state.events.flatMap((event) => getEventOccurrences(event, first, last));
}

function renderCalendar() {
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const days = buildCalendarDays(year, month);
  dom.calendarGrid.innerHTML = '';
  const monthEvents = getMonthEvents(year, month);
  const monthCost = monthEvents.reduce((sum, evt) => sum + Number(evt.cost || 0), 0);

  dom.monthLabel.textContent = `${state.currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })} (${String(month + 1).padStart(2, '0')})`;
  dom.yearSelect.value = year;
  dom.monthSelect.value = month;
  dom.monthEventsCount.textContent = `${monthEvents.length} event${monthEvents.length !== 1 ? 's' : ''}`;
  dom.monthCostTotal.textContent = formatMoney(monthCost);

  days.forEach((date) => {
    const occurrences = state.events.flatMap((event) => getEventOccurrences(event, date, date));
    const hasDoneEvent = occurrences.some(evt => evt.done === true);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `calendar-cell${date.getMonth() !== month ? ' inactive' : ''}${occurrences.length ? ' has-event' : ''}${hasDoneEvent ? ' has-done-event' : ''}`;
    cell.innerHTML = `
      <div class="day-number">${date.getDate()}</div>
      <div class="event-dot"></div>
    `;
    const dot = cell.querySelector('.event-dot');
    dot.innerHTML = '';
    if (occurrences.length) {
      occurrences.slice(0, 2).forEach((evt) => {
        const chip = document.createElement('span');
        chip.className = `event-chip${evt.done ? ' done' : ''}`;
        chip.textContent = `${evt.title} ${evt.repeat === 'yearly' ? '🔁' : ''}`;
        dot.appendChild(chip);
      });
      cell.title = occurrences.map((evt) => `${evt.title} (${evt.occurrence}) ${evt.done ? '[DONE]' : ''}`).join('\n');
    } else {
      cell.title = 'No events';
    }
    cell.addEventListener('click', () => {
      dom.date.value = formatISO(date);
      dom.title.focus();
    });
    dom.calendarGrid.appendChild(cell);
  });
}

function buildTimelineItems() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - state.timelinePastMonths, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + state.timelineFutureMonths + 1, 0);
  const occurrences = state.events.flatMap((event) => {
    const eventOccurrences = getEventOccurrences(event, start, end);
    // For yearly events, only show future occurrences
    if (event.repeat === 'yearly') {
      return eventOccurrences.filter(occ => !isEventPast(occ.dateObj));
    }
    return eventOccurrences;
  });
  occurrences.sort((a, b) => a.dateObj - b.dateObj);

  // Update the range label
  dom.timelineRangeLabel.textContent = `Past ${state.timelinePastMonths} months + next ${state.timelineFutureMonths} months`;

  dom.eventList.innerHTML = occurrences.map((evt) => {
    const isPast = isEventPast(evt.dateObj);
    const isWithinLastWeek = isEventWithinLastWeek(evt.dateObj);
    const isDone = evt.done === true;
    let stripClass = 'strip-neutral';
    if (isDone) {
      stripClass = 'strip-done';
    } else if (isPast) {
      stripClass = 'strip-past';
    } else if (isWithinLastWeek) {
      stripClass = 'strip-upcoming';
    }
    return `
      <div class="timeline-item${evt.done ? ' done' : ''}${isPast ? ' is-past' : ''}">
        <div class="timeline-strip ${stripClass}"></div>
        <button class="done-btn-large${evt.done ? ' completed' : ''}" data-id="${evt.id}" title="${evt.done ? 'Mark as pending' : 'Mark as done'}" aria-label="${evt.done ? 'Mark as completed' : 'Mark as pending'}">
          ${evt.done ? '<span class="button-icon">✓</span><span class="button-text">Done</span>' : '<span class="button-icon">○</span><span class="button-text">Pending</span>'}
        </button>
        <div class="timeline-content">
          <time datetime="${evt.occurrence}">${evt.occurrence}</time>
          <strong>${evt.title}</strong>
          <span class="timeline-meta">${evt.repeat === 'yearly' ? 'Yearly reminder' : 'One-time reminder'} • €${Number(evt.cost).toFixed(2)} • ${evt.notes || 'No notes'}</span>
        </div>
        <div class="item-actions">
          <button class="edit" data-id="${evt.id}">Edit</button>
          <button class="delete" data-id="${evt.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('') || '<div style="color:#8da6ff; padding: 18px; border-radius: 18px; background: rgba(255,255,255,0.03);">No events found in the selected range.</div>';

  dom.eventList.querySelectorAll('button.done-btn-large').forEach((button) => {
    button.addEventListener('click', () => toggleEventDone(button.dataset.id));
  });
  dom.eventList.querySelectorAll('button.edit').forEach((button) => {
    button.addEventListener('click', () => loadEventForEdit(button.dataset.id));
  });
  dom.eventList.querySelectorAll('button.delete').forEach((button) => {
    button.addEventListener('click', () => removeEvent(button.dataset.id));
  });
}

function renderStats() {
  const year = state.currentDate.getFullYear();
  dom.statsYear.textContent = `${year}`;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const occurrences = state.events.flatMap((event) => getEventOccurrences(event, start, end));
  const total = occurrences.reduce((sum, evt) => sum + Number(evt.cost || 0), 0);
  const average = total / 12;

  dom.yearTotal.textContent = formatMoney(total);
  dom.yearEvents.textContent = `${occurrences.length}`;
  dom.yearAverage.textContent = formatMoney(average);

  const monthSums = Array.from({ length: 12 }, (_, index) => {
    const monthStart = new Date(year, index, 1);
    const monthEnd = new Date(year, index + 1, 0);
    const monthEvents = state.events.flatMap((event) => getEventOccurrences(event, monthStart, monthEnd));
    return monthEvents.reduce((sum, evt) => sum + Number(evt.cost || 0), 0);
  });
  const max = Math.max(...monthSums, 1);
  dom.monthlyBars.innerHTML = monthSums.map((value, index) => {
    const label = new Date(year, index, 1).toLocaleString('en-US', { month: 'short' });
    const width = Math.round((value / max) * 100);
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <span>${label}</span>
          <strong>${formatMoney(value)}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${width}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

async function fetchEvents() {
  const response = await fetch('/api/events');
  state.events = await response.json();
  renderApp();
  // Check for yearly event resets after loading events
  checkAndResetYearlyEvents();
}

async function saveEvent(event) {
  const method = event.id ? 'PUT' : 'POST';
  const url = event.id ? `/api/events/${event.id}` : '/api/events';
  await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  await fetchEvents();
}

async function removeEvent(id) {
  await fetch(`/api/events/${id}`, { method: 'DELETE' });
  await fetchEvents();
}

async function toggleEventDone(id) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  event.done = !event.done;
  await saveEvent(event);
}

function resetForm() {
  dom.form.reset();
  dom.eventId.value = '';
  dom.date.value = formatISO(new Date());
  dom.done.checked = false;
}

function loadEventForEdit(id) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  dom.title.value = event.title;
  dom.date.value = event.date;
  dom.cost.value = Number(event.cost || 0).toFixed(2);
  dom.repeat.value = event.repeat;
  dom.notes.value = event.notes || '';
  dom.done.checked = event.done || false;
  dom.eventId.value = event.id;
}

function renderApp() {
  dom.todayLabel.textContent = `ISO Date: ${formatISO(new Date())}`;
  renderCalendar();
  buildTimelineItems();
  renderStats();
}

dom.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    id: dom.eventId.value || undefined,
    title: dom.title.value.trim(),
    date: dom.date.value,
    cost: Number(dom.cost.value) || 0,
    repeat: dom.repeat.value,
    notes: dom.notes.value.trim(),
    done: dom.done.checked,
  };
  if (!payload.title || !payload.date) return;
  await saveEvent(payload);
  resetForm();
});

dom.clearForm.addEventListener('click', resetForm);

dom.prevMonth.addEventListener('click', () => {
  state.currentDate.setMonth(state.currentDate.getMonth() - 1);
  renderApp();
});

dom.nextMonth.addEventListener('click', () => {
  state.currentDate.setMonth(state.currentDate.getMonth() + 1);
  renderApp();
});

dom.monthSelect.addEventListener('change', () => {
  const selectedMonth = parseInt(dom.monthSelect.value, 10);
  state.currentDate.setMonth(selectedMonth);
  renderApp();
});

dom.yearSelect.addEventListener('change', () => {
  const selectedYear = parseInt(dom.yearSelect.value, 10);
  state.currentDate.setFullYear(selectedYear);
  renderApp();
});

dom.timelinePastMonths.addEventListener('change', () => {
  state.timelinePastMonths = parseInt(dom.timelinePastMonths.value, 10);
  renderApp();
});

dom.timelineFutureMonths.addEventListener('change', () => {
  state.timelineFutureMonths = parseInt(dom.timelineFutureMonths.value, 10);
  renderApp();
});

window.addEventListener('DOMContentLoaded', () => {
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    dom.yearSelect.appendChild(option);
  }
  dom.date.value = formatISO(new Date());
  // Set initial timeline range values
  dom.timelinePastMonths.value = state.timelinePastMonths;
  dom.timelineFutureMonths.value = state.timelineFutureMonths;
  fetchEvents();

  // Check for yearly event resets every minute
  setInterval(checkAndResetYearlyEvents, 60000);

  // Check for resets when page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAndResetYearlyEvents();
    }
  });
});
