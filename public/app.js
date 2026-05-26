/**
 * Frontend application logic for Car Maintenance Tracker.
 * Manages calendar rendering, timeline search, locale switching,
 * user authentication flows, and event CRUD interactions.
 */
const POLL_INTERVAL_MS = 30000;

// App state stored in memory for rendering and UI behavior
const state = {
  events: [],
  currentDate: new Date(),
  currentUser: null,
  searchTerm: '',
};

// Cached DOM references for page interactions and UI updates
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
  modal: document.getElementById('event-modal'),
  modalOverlay: document.getElementById('event-modal-overlay'),
  openEventModal: document.getElementById('open-event-modal'),
  closeEventModal: document.getElementById('close-event-modal'),
  cancelEventButton: document.getElementById('cancel-event'),
  form: document.getElementById('event-form'),
  title: document.getElementById('title'),
  date: document.getElementById('date'),
  nativeDateInput: document.getElementById('native-date'),
  cost: document.getElementById('cost'),
  repeat: document.getElementById('repeat'),
  notes: document.getElementById('notes'),
  done: document.getElementById('done'),
  eventId: document.getElementById('event-id'),
  eventOriginId: document.getElementById('event-origin-id'),
  eventOriginDate: document.getElementById('event-origin-date'),
  eventOriginalRepeat: document.getElementById('event-original-repeat'),
  clearForm: document.getElementById('clear-form'),
  yearSelect: document.getElementById('year-select'),
  monthSelect: document.getElementById('month-select'),
  prevYear: document.getElementById('prev-year'),
  nextYear: document.getElementById('next-year'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  timelineRangeLabel: document.getElementById('timeline-range-label'),
  localeButton: document.getElementById('locale-button'),
  localeMenu: document.getElementById('locale-menu'),
  localeSwitcher: document.getElementById('locale-switcher'),
  userButton: document.getElementById('user-button'),
  userMenu: document.getElementById('user-menu'),
  loginModal: document.getElementById('login-modal'),
  loginOverlay: document.getElementById('login-modal-overlay'),
  loginForm: document.getElementById('login-form'),
  loginUsername: document.getElementById('login-username'),
  loginPassword: document.getElementById('login-password'),
  setupModal: document.getElementById('setup-modal'),
  setupOverlay: document.getElementById('setup-modal-overlay'),
  setupForm: document.getElementById('setup-form'),
  setupUsername: document.getElementById('setup-username'),
  setupPassword: document.getElementById('setup-password'),
  changePasswordModal: document.getElementById('change-password-modal'),
  changePasswordOverlay: document.getElementById('change-password-modal-overlay'),
  changePasswordForm: document.getElementById('change-password-form'),
  oldPassword: document.getElementById('old-password'),
  newPassword: document.getElementById('new-password'),
  createUserModal: document.getElementById('create-user-modal'),
  createUserOverlay: document.getElementById('create-user-modal-overlay'),
  createUserForm: document.getElementById('create-user-form'),
  createUserUsername: document.getElementById('create-user-username'),
  createUserPassword: document.getElementById('create-user-password'),
  createUserRole: document.getElementById('create-user-role'),
  timelineSearch: document.getElementById('timeline-search'),
  deleteConfirmModal: document.getElementById('delete-confirm-modal'),
  deleteConfirmOverlay: document.getElementById('delete-confirm-overlay'),
  deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
  deleteCancelBtn: document.getElementById('delete-cancel-btn'),
};

// State for pending deletion
let pendingDeleteId = null;

// Shared Flatpickr instance for date selection
let datePicker;

// Simple numeric padding helper for date formatting
function pad(value) {
  return String(value).padStart(2, '0');
}

// Toast notification system for user feedback messages
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto-hide after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300); // Wait for fade out animation
  }, duration);
}

function formatISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISODate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper function to set date in both input and Flatpickr
function setDateValue(isoDate) {
  dom.date.value = isoDate;
  if (datePicker) {
    datePicker.setDate(isoDate, false); // false prevents triggering onChange
  }
  if (dom.nativeDateInput) {
    dom.nativeDateInput.value = isoDate;
  }
}

function openMobileDatePicker() {
  if (!dom.nativeDateInput) return;
  if (typeof dom.nativeDateInput.showPicker === 'function') {
    dom.nativeDateInput.showPicker();
  } else {
    dom.nativeDateInput.focus();
  }
}

// Format currency values for the UI
function formatMoney(amount) {
  return `€${amount.toFixed(2)}`;
}

// Supported locale definitions for UI translation and flag icons
const LOCALES = [
  { code: 'en-US', flag: 'us.svg', short: 'US', label: 'English (US)' },
  { code: 'bg', flag: 'bg.svg', short: 'BG', label: 'Български (BG)' },
  { code: 'ja-JP', flag: 'jp.svg', short: 'JP', label: '日本語 (JP)' },
  { code: 'th-TH', flag: 'th.svg', short: 'TH', label: 'ไทย (TH)' },
  { code: 'pirate', flag: 'arrg.png', short: 'ARRG', label: 'Pirate (ARRG)' },
];

const localeBundles = {};
let selectedLocale = 'en-US';

// Load localization bundles for all supported languages
async function loadLocales() {
  for (const locale of LOCALES) {
    try {
      const response = await fetch(`/locales/${locale.code}.json`);
      if (response.ok) {
        localeBundles[locale.code] = await response.json();
      } else {
        localeBundles[locale.code] = {};
      }
    } catch {
      localeBundles[locale.code] = {};
    }
  }
}

// Apply the current user's preferred locale if available
function loadUserSettings() {
  if (state.currentUser && state.currentUser.settings.locale) {
    selectedLocale = state.currentUser.settings.locale;
  }
}

function gettext(key) {
  return localeBundles[selectedLocale]?.[key] ?? localeBundles['en-US']?.[key] ?? key;
}

function formatEventCount(count) {
  const label = count === 1 ? gettext('eventSingular') : gettext('eventPlural');
  return `${count} ${label}`;
}

function getFlagMarkup(flag, short) {
  return `<img class="flag-icon" src="/images/flags/${flag}" alt="${short} flag" />`;
}

// Update locale menu UI with the currently selected language
function updateLocaleMenu() {
  const selected = LOCALES.find((item) => item.code === selectedLocale) || LOCALES[0];
  dom.localeButton.innerHTML = `${getFlagMarkup(selected.flag, selected.short)}<span class="locale-short">${selected.short}</span>`;
  dom.localeButton.setAttribute('aria-label', `${selected.label} locale`);
  dom.localeMenu.innerHTML = '';

  LOCALES.forEach((locale) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.locale = locale.code;
    button.innerHTML = `${getFlagMarkup(locale.flag, locale.short)}${locale.label}`;
    button.setAttribute('role', 'option');
    if (locale.code === selectedLocale) {
      button.setAttribute('aria-selected', 'true');
    }
    dom.localeMenu.appendChild(button);
  });
}

// Switch the app locale, refresh the UI, and persist the choice for logged-in users
async function setLocale(code) {
  const locale = LOCALES.find((entry) => entry.code === code) ? code : 'en-US';
  selectedLocale = locale;
  document.documentElement.lang = selectedLocale === 'bg' ? 'bg' : 'en';
  updateLocaleMenu();
  applyLocaleTexts();
  renderApp();
  closeLocaleMenu();
  if (state.currentUser) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { locale: selectedLocale } }),
      credentials: 'include'
    });
  }
}

function toggleLocaleMenu() {
  const isOpen = dom.localeMenu.classList.toggle('open');
  dom.localeButton.setAttribute('aria-expanded', String(isOpen));
}

function closeLocaleMenu() {
  dom.localeMenu.classList.remove('open');
  dom.localeButton.setAttribute('aria-expanded', 'false');
}

function applyLocaleTexts() {
  const locale = localeBundles[selectedLocale] || localeBundles['en-US'] || {};

  document.documentElement.lang = selectedLocale === 'bg' ? 'bg' : 'en';
  document.getElementById('app-title').textContent = gettext('appTitle');
  document.getElementById('app-subtitle').textContent = gettext('appSubtitle');
  document.getElementById('today-label').textContent = `${gettext('todayLabel')} ${formatISO(new Date())}`;
  document.getElementById('calendar-title').textContent = gettext('calendarTitle');
  document.getElementById('timeline-title').textContent = gettext('timelineHeader');
  document.getElementById('timeline-range-label').textContent = gettext('timelineRangeLabel');
  dom.timelineSearch.placeholder = gettext('searchEvents');
  document.getElementById('stats-title').textContent = gettext('statsTitle');
  dom.openEventModal.textContent = gettext('addEvent');
  dom.openEventModal.setAttribute('aria-label', gettext('addEvent'));
  document.getElementById('year-total-label').textContent = gettext('total');
  document.getElementById('year-events-label').textContent = gettext('events');
  document.getElementById('year-average-label').textContent = gettext('averagePerMonth');
  document.getElementById('modal-header-title').textContent = gettext('addEditTitle');
  document.getElementById('event-modal-title').textContent = gettext('eventModalTitle');
  document.querySelector('label[for="title"]').textContent = gettext('titleLabel');
  document.querySelector('label[for="date"]').textContent = gettext('dateLabel');
  document.querySelector('label[for="cost"]').textContent = gettext('costLabel');
  document.querySelector('label[for="repeat"]').textContent = gettext('repeatLabel');
  document.querySelector('label[for="notes"]').textContent = gettext('notesLabel');
  document.querySelector('.checkbox-label').childNodes[1].textContent = ` ${gettext('markComplete')}`;
  updateLocaleMenu();

  dom.repeat.querySelector('option[value="none"]').textContent = gettext('oneTime');
  dom.repeat.querySelector('option[value="yearly"]').textContent = gettext('yearly');
  document.getElementById('save-event').textContent = gettext('save');
  dom.clearForm.textContent = gettext('clear');
  dom.cancelEventButton.textContent = gettext('cancel');

  dom.monthSelect.querySelectorAll('option').forEach((option, index) => {
    option.textContent = locale.months?.[index] || option.textContent;
  });

  document.querySelectorAll('.weekday-bar span').forEach((span, index) => {
    span.textContent = locale.weekdays?.[index] || span.textContent;
  });

  if (state.currentUser) {
    initializeUserUI();
  }
}

function buildLocaleMonthLabel(year, month) {
  const locale = localeBundles[selectedLocale] || localeBundles['en-US'] || {};
  const monthName = locale.months?.[month] || new Date(year, month).toLocaleString(selectedLocale, { month: 'long' });
  return `${monthName} ${year}`;
}

function isLocaleOpen() {
  return dom.localeMenu.classList.contains('open');
}

function closeLocaleMenuIfNeeded(event) {
  if (!dom.localeSwitcher?.contains(event.target) && isLocaleOpen()) {
    closeLocaleMenu();
  }
}

function initializeLocaleUI() {
  dom.localeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleLocaleMenu();
  });
  dom.localeMenu.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    setLocale(button.dataset.locale);
  });
  window.addEventListener('click', closeLocaleMenuIfNeeded);
}

function showEventModal({ reset = false } = {}) {
  if (reset) {
    resetForm();
  }
  dom.modal.classList.add('open');
  dom.modal.setAttribute('aria-hidden', 'false');
  
  // Double-check date input has correct ISO format value after modal is shown
  if (reset) {
    setTimeout(() => {
      const now = new Date();
      const expectedISO = now.getFullYear() + '-' + 
                         String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(now.getDate()).padStart(2, '0');
      if (dom.date.value !== expectedISO) {
        setDateValue(expectedISO);
      }
    }, 10);
  }
}

function hideEventModal() {
  dom.modal.classList.remove('open');
  dom.modal.setAttribute('aria-hidden', 'true');
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

function getYearlyOverride(parentId, year) {
  return state.events.find((event) => event.origin_id === parentId && parseISODate(event.date).getFullYear() === year);
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

// Placeholder hook for resetting generated yearly events after load
function checkAndResetYearlyEvents() {
  // Yearly occurrences are handled separately by generated per-year state.
}

function getEventOccurrences(event, startDate, endDate) {
  const occurrences = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (event.origin_id) {
    const eventDate = parseISODate(event.date);
    const originEvent = state.events.find((item) => item.id === event.origin_id);
    if (eventDate >= start && eventDate <= end) {
      occurrences.push({
        ...event,
        title: originEvent?.title || event.title,
        repeat: originEvent?.repeat || event.repeat,
        occurrence: formatISO(eventDate),
        dateObj: eventDate,
        origin_id: event.origin_id,
        isOverride: true,
      });
    }
    return occurrences;
  }

  const baseDate = parseISODate(event.date);
  if (event.repeat === 'yearly') {
    const createdYear = event.created_year || baseDate.getFullYear();
    const firstYear = Math.max(baseDate.getFullYear(), start.getFullYear());
    for (let year = firstYear; year <= end.getFullYear(); year += 1) {
      const candidate = new Date(year, baseDate.getMonth(), baseDate.getDate());
      if (candidate < start || candidate > end) {
        continue;
      }

      const isOriginalOccurrence = year === baseDate.getFullYear();
      if (!isOriginalOccurrence) {
        const override = getYearlyOverride(event.id, year);
        if (override) {
          continue; // Override event will be returned separately
        }
      }

      occurrences.push({
        ...event,
        occurrence: formatISO(candidate),
        dateObj: candidate,
        done: isOriginalOccurrence ? event.done : false,
        parentId: isOriginalOccurrence ? undefined : event.id,
        isGenerated: !isOriginalOccurrence,
      });
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

  dom.monthLabel.textContent = buildLocaleMonthLabel(year, month);
  dom.yearSelect.value = year;
  dom.monthSelect.value = month;
  dom.monthEventsCount.textContent = formatEventCount(monthEvents.length);
  dom.monthCostTotal.textContent = formatMoney(monthCost);

  days.forEach((date) => {
    const occurrences = state.events.flatMap((event) => getEventOccurrences(event, date, date));
    const hasDoneEvent = occurrences.some(evt => evt.done === true);
    const hasUndoneEvent = occurrences.some(evt => !evt.done);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cellDate = new Date(date);
    cellDate.setHours(0, 0, 0, 0);
    const isPastDate = cellDate < today;
    const isToday = isSameDay(cellDate, today);
    const allDone = occurrences.length > 0 && occurrences.every(evt => evt.done === true);
    const cell = document.createElement('button');
    cell.type = 'button';
    let cellClasses = 'calendar-cell';
    if (date.getMonth() !== month) cellClasses += ' inactive';
    if (occurrences.length) cellClasses += ' has-event';
    if (allDone) {
      cellClasses += ' has-done-event';
    } else if (isPastDate && hasUndoneEvent) {
      cellClasses += ' has-overdue-event';
    } else if (isToday && hasUndoneEvent) {
      cellClasses += ' has-due-event';
    } else if (hasUndoneEvent) {
      cellClasses += ' has-upcoming-event';
    }
    cell.className = cellClasses;
    cell.innerHTML = `
      <div class="day-number">${date.getDate()}</div>
      <div class="event-dot"></div>
    `;
    const dot = cell.querySelector('.event-dot');
    dot.innerHTML = '';
    if (occurrences.length) {
      const visibleEvents = occurrences.slice(0, 2);
      const lines = visibleEvents.map((evt) => `${evt.title}${evt.repeat === 'yearly' ? ' 🔁' : ''}`);
      if (occurrences.length > visibleEvents.length) {
        const hiddenCount = occurrences.length - visibleEvents.length;
        lines.push(`+${hiddenCount} more`);
      }

      const chip = document.createElement('span');
      chip.className = `event-chip${occurrences.some(evt => evt.done) ? ' done' : ''}`;
      chip.textContent = lines.join('\n');
      dot.appendChild(chip);
      cell.title = occurrences.map((evt) => `${evt.title} (${evt.occurrence}) ${evt.done ? '[DONE]' : ''}`).join('\n');
    } else {
      cell.title = 'No events';
    }
    cell.addEventListener('click', () => {
      if (state.currentUser.role === 'admin') {
        resetForm();
        setDateValue(formatISO(date));
        showEventModal();
        dom.title.focus();
      }
    });
    dom.calendarGrid.appendChild(cell);
  });
  adjustCalendarEventTextSizes();
}

function adjustCalendarEventTextSizes() {
  const cells = dom.calendarGrid.querySelectorAll('.calendar-cell.has-event');
  if (!cells.length) return;

  cells.forEach((cell) => {
    const dot = cell.querySelector('.event-dot');
    const chip = dot?.querySelector('.event-chip');
    if (!dot || !chip) return;

    const minSize = 0.58;
    const step = 0.04;
    let size = 0.95;
    dot.style.setProperty('--calendar-event-chip-size', `${size}rem`);

    while (chip.scrollHeight > dot.clientHeight && size > minSize) {
      size = Math.max(minSize, size - step);
      dot.style.setProperty('--calendar-event-chip-size', `${size}rem`);
    }
  });
}

// Build timeline items for the selected year and apply search filtering
function buildTimelineItems(searchFilter = '') {
  const year = state.currentDate.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  let occurrences = state.events.flatMap((event) => getEventOccurrences(event, start, end));
  
  // Filter by search term if provided
  if (searchFilter.trim()) {
    const filter = searchFilter.toLowerCase();
    const isReverseSearch = filter.startsWith('!');
    const actualFilter = isReverseSearch ? filter.slice(1) : filter;
    
    occurrences = occurrences.filter((evt) => {
      const matches = evt.title.toLowerCase().includes(actualFilter) || 
        (evt.notes && evt.notes.toLowerCase().includes(actualFilter));
      return isReverseSearch ? !matches : matches;
    });
  }
  
  occurrences.sort((a, b) => a.dateObj - b.dateObj);

  // Update the range label for the selected year
  dom.timelineRangeLabel.textContent = gettext('timelineRangeLabel');

  dom.eventList.innerHTML = occurrences.map((evt) => {
    const canModify = state.currentUser?.role === 'admin';
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
    const actionButtons = canModify ? `
        <button class="edit" data-id="${evt.id}" data-origin-id="${evt.origin_id || evt.parentId || ''}" data-generated="${evt.isGenerated ? 'true' : 'false'}" data-is-override="${evt.origin_id ? 'true' : 'false'}" data-occurrence-date="${evt.occurrence}">${gettext('edit')}</button>
        <button class="delete" data-id="${evt.id}">${gettext('delete')}</button>
      ` : '';
    return `
      <div class="timeline-item${evt.done ? ' done' : ''}${isPast ? ' is-past' : ''}">
        <div class="timeline-strip ${stripClass}"></div>
        ${canModify ? `<button class="done-btn-large${evt.done ? ' completed' : ''}"
          data-id="${evt.id}"
          data-parent-id="${evt.origin_id || evt.parentId || ''}"
          data-origin-id="${evt.origin_id || evt.parentId || ''}"
          data-generated="${evt.isGenerated ? 'true' : 'false'}"
          data-is-override="${evt.origin_id ? 'true' : 'false'}"
          data-occurrence-date="${evt.occurrence}"
          data-done="${isDone}"
          title="${evt.done ? gettext('markAsPending') : gettext('markAsDone')}"
          aria-label="${evt.done ? gettext('markAsPending') : gettext('markAsCompleted')}">
          ${evt.done ? `<span class="button-icon">✓</span><span class="button-text">${gettext('doneLabel')}</span>` : `<span class="button-icon">○</span><span class="button-text">${gettext('pendingLabel')}</span>`}
        </button>` : ''}
        <div class="timeline-content">
          <time datetime="${evt.occurrence}">${evt.occurrence}</time>
          <strong>${evt.title}</strong>
          <span class="timeline-meta">${evt.repeat === 'yearly' ? gettext('yearlyReminder') : gettext('oneTimeReminder')} • €${Number(evt.cost).toFixed(2)} • ${evt.notes || gettext('noNotes')}</span>
        </div>
        <div class="item-actions">
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('') || '<div style="color:#8da6ff; padding: 18px; border-radius: 18px; background: rgba(255,255,255,0.03);">No events found in the selected range.</div>';

  dom.eventList.querySelectorAll('button.done-btn-large').forEach((button) => {
    button.addEventListener('click', () => toggleEventDone(
      button.dataset.id,
      button.dataset.originId,
      button.dataset.occurrenceDate,
      button.dataset.done === 'true',
      button.dataset.isOverride === 'true',
      button.dataset.generated === 'true',
    ));
  });
  dom.eventList.querySelectorAll('button.edit').forEach((button) => {
    button.addEventListener('click', () => loadEventForEdit(
      button.dataset.id,
      button.dataset.originId,
      button.dataset.occurrenceDate,
      button.dataset.generated === 'true',
      button.dataset.isOverride === 'true',
    ));
  });
  dom.eventList.querySelectorAll('button.delete').forEach((button) => {
    button.addEventListener('click', () => showDeleteConfirm(button.dataset.id));
  });
}

// Render yearly statistics and month-by-month expense bars
function renderStats(searchFilter = '') {
  const year = state.currentDate.getFullYear();
  dom.statsYear.textContent = `${year}`;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  let occurrences = state.events.flatMap((event) => getEventOccurrences(event, start, end));
  
  // Filter by search term if provided
  if (searchFilter.trim()) {
    const filter = searchFilter.toLowerCase();
    const isReverseSearch = filter.startsWith('!');
    const actualFilter = isReverseSearch ? filter.slice(1) : filter;
    occurrences = occurrences.filter((evt) => {
      const matches = evt.title.toLowerCase().includes(actualFilter) ||
        (evt.notes && evt.notes.toLowerCase().includes(actualFilter));
      return isReverseSearch ? !matches : matches;
    });
  }
  
  const total = occurrences.reduce((sum, evt) => sum + Number(evt.cost || 0), 0);
  const average = total / 12;

  dom.yearTotal.textContent = formatMoney(total);
  dom.yearEvents.textContent = `${occurrences.length}`;
  dom.yearAverage.textContent = formatMoney(average);

  const locale = localeBundles[selectedLocale] || localeBundles['en-US'] || {};
  const monthSums = Array.from({ length: 12 }, (_, index) => {
    const monthStart = new Date(year, index, 1);
    const monthEnd = new Date(year, index + 1, 0);
    const monthEvents = occurrences.filter((evt) => evt.dateObj >= monthStart && evt.dateObj <= monthEnd);
    return monthEvents.reduce((sum, evt) => sum + Number(evt.cost || 0), 0);
  });
  const max = Math.max(...monthSums, 1);
  dom.monthlyBars.innerHTML = monthSums.map((value, index) => {
    const label = locale.months?.[index] || new Date(year, index, 1).toLocaleString(selectedLocale, { month: 'short' });
    const width = Math.round((value / max) * 100);
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <span>${label}</span>
          <strong class="${value === 0 ? 'zero-cost' : 'has-cost'}">${formatMoney(value)}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${width}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

// Load events from the backend and refresh the UI
async function fetchEvents() {
  const response = await fetch('/api/events', { credentials: 'include' });
  state.events = await response.json();
  renderApp();
  // Check for yearly event resets after loading events
  checkAndResetYearlyEvents();
}

// Create or update an event on the server, then reload events
async function saveEvent(event) {
  const method = event.id ? 'PUT' : 'POST';
  const url = event.id ? `/api/events/${event.id}` : '/api/events';
  await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    credentials: 'include'
  });
  await fetchEvents();
}

// Show delete confirmation modal
function showDeleteConfirm(id) {
  // Localize the modal
  // Keep the structural subtitle (`#delete-confirm-title`) as authored in HTML
  // only update the section label and the explanatory message.
  document.getElementById('delete-confirm-title-label').textContent = gettext('deleteConfirmTitle');
  document.getElementById('delete-confirm-title').textContent = gettext('deleteConfirmSubtitle');
  document.getElementById('delete-confirm-message').textContent = gettext('deleteConfirmMessage');
  document.getElementById('delete-cancel-btn').textContent = gettext('deleteCancelBtn');
  document.getElementById('delete-confirm-btn').textContent = gettext('deleteConfirmBtn');
  
  pendingDeleteId = id;
  dom.deleteConfirmModal.classList.add('open');
  dom.deleteConfirmModal.setAttribute('aria-hidden', 'false');
}

// Hide delete confirmation modal
function hideDeleteConfirm() {
  pendingDeleteId = null;
  dom.deleteConfirmModal.classList.remove('open');
  dom.deleteConfirmModal.setAttribute('aria-hidden', 'true');
}

// Delete an event on the server and refresh the event list
async function removeEvent(id) {
  await fetch(`/api/events/${id}`, { method: 'DELETE', credentials: 'include' });
  await fetchEvents();
  hideDeleteConfirm();
  showToast(gettext('eventDeletedSuccessfully'), 'success');
}

async function toggleEventDone(id, parentId, occurrenceDate, currentDone, isOverride) {
  if (parentId && !isOverride) {
    const year = parseISODate(occurrenceDate).getFullYear();
    const existingOverride = getYearlyOverride(parentId, year);
    if (existingOverride) {
      existingOverride.done = !currentDone;
      await saveEvent(existingOverride);
      return;
    }

    const sourceEvent = state.events.find((item) => item.id === id);
    if (!sourceEvent) return;

    const overridePayload = {
      date: occurrenceDate,
      cost: Number(sourceEvent.cost || 0),
      notes: sourceEvent.notes || '',
      done: !currentDone,
      origin_id: parentId,
      created_year: parseISODate(occurrenceDate).getFullYear(),
    };
    await saveEvent(overridePayload);
    return;
  }

  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  event.done = !currentDone;
  await saveEvent(event);
}

function resetForm() {
  dom.form.reset();
  dom.eventId.value = '';
  dom.eventOriginId.value = '';
  dom.eventOriginDate.value = '';
  dom.eventOriginalRepeat.value = '';
  
  // Set current date in ISO format (YYYY-MM-DD)
  const now = new Date();
  const isoDateString = now.getFullYear() + '-' + 
                       String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(now.getDate()).padStart(2, '0');
  setDateValue(isoDateString);
  
  dom.done.checked = false;
  dom.title.readOnly = false;
  dom.repeat.disabled = false;
}

dom.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const originId = dom.eventOriginId.value || undefined;
  const originalRepeat = dom.eventOriginalRepeat.value || 'none';
  const repeatValue = dom.repeat.value;
  const isOverrideCreation = !dom.eventId.value && originId;
  const repeatChanged = dom.eventId.value && repeatValue !== originalRepeat;
  const titleValue = dom.title.value.trim();
  let dateValue = dom.date.value;
  const costValue = parseFloat(dom.cost.value.replace(/[^0-9.]/g, '')) || 0;

  if (!dateValue) return;
  if (!originId && !titleValue) return;

  // Ensure date is in ISO format (YYYY-MM-DD)
  if (dateValue && !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    // If not in ISO format, try to parse and reformat
    const parsedDate = new Date(dateValue);
    if (!isNaN(parsedDate.getTime())) {
      dateValue = formatISO(parsedDate);
    } else {
      showToast('Invalid date format. Please use YYYY-MM-DD format.', 'error');
      return;
    }
  }

  const payload = {
    date: dateValue,
    cost: costValue,
    notes: dom.notes.value.trim(),
    done: dom.done.checked,
    origin_id: originId,
    created_year: originId ? parseISODate(dateValue).getFullYear() : (!dom.eventId.value ? new Date().getFullYear() : undefined),
  };

  if (!originId) {
    payload.title = titleValue;
    payload.repeat = isOverrideCreation ? 'none' : repeatValue;
  }

  if (repeatChanged && dom.eventId.value) {
    const deleteResponse = await fetch(`/api/events/${dom.eventId.value}`, { method: 'DELETE', credentials: 'include' });
    if (deleteResponse.ok) {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      await fetchEvents();
    }
  } else {
    payload.id = dom.eventId.value || undefined;
    await saveEvent(payload);
  }

  resetForm();
  hideEventModal();
});

function loadEventForEdit(id, originId, occurrenceDate, isGenerated, isOverride) {
  const event = state.events.find((item) => item.id === id);
  const originEvent = originId ? state.events.find((item) => item.id === originId) : null;
  if (!event && !originEvent) return;

  const actualOverride = event && event.origin_id;
  const sourceEvent = originEvent || event;
  if (!sourceEvent) return;

  const isReadOnly = Boolean(originId);
  const repeatValue = originEvent
    ? (originEvent.repeat === 'yearly' ? 'yearly' : 'none')
    : (isGenerated ? 'yearly' : (sourceEvent.repeat === 'yearly' ? 'yearly' : 'none'));

  dom.title.value = originEvent?.title || event?.title || '';
  const eventDate = isGenerated ? occurrenceDate : formatISO(new Date(event?.date || sourceEvent.date));
  // Ensure date is in ISO format
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : formatISO(new Date(eventDate));
  setDateValue(isoDate);
  dom.cost.value = Number((actualOverride ? event : sourceEvent)?.cost || 0).toFixed(2);
  dom.repeat.value = repeatValue;
  dom.notes.value = (actualOverride ? event : sourceEvent)?.notes || '';
  dom.done.checked = (actualOverride ? event : sourceEvent)?.done || false;
  dom.title.readOnly = isReadOnly;
  dom.repeat.disabled = isReadOnly;

  if (isGenerated) {
    dom.eventId.value = '';
    dom.eventOriginId.value = originId;
    dom.eventOriginDate.value = occurrenceDate;
    dom.eventOriginalRepeat.value = 'yearly';
  } else if (isOverride) {
    dom.eventId.value = event?.id || '';
    dom.eventOriginId.value = event?.origin_id || '';
    dom.eventOriginDate.value = event?.origin_id ? event.date : '';
    dom.eventOriginalRepeat.value = originEvent?.repeat || 'none';
  } else {
    dom.eventId.value = event?.id || '';
    dom.eventOriginId.value = event?.origin_id || '';
    dom.eventOriginDate.value = event?.origin_id ? event.date : '';
    dom.eventOriginalRepeat.value = sourceEvent.repeat || 'none';
  }

  showEventModal();
}

function renderApp() {
  dom.todayLabel.textContent = `${gettext('todayLabel')} ${formatISO(new Date())}`;
  renderCalendar();
  buildTimelineItems(state.searchTerm);
  renderStats(state.searchTerm);
}

window.addEventListener('resize', adjustCalendarEventTextSizes);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustCalendarEventTextSizes);
}

dom.clearForm.addEventListener('click', resetForm);

// Basic validation for manual input (Flatpickr handles most validation)
dom.date.addEventListener('blur', (e) => {
  const value = e.target.value.trim();
  
  if (!value) return;
  
  // Check if it's already in ISO format and valid
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return; // Valid ISO date
    }
  }
  
  // Try to parse and convert to ISO format
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    e.target.value = formatISO(date);
  } else {
    // Invalid date, clear it
    e.target.value = '';
  }
});

dom.prevYear.addEventListener('click', () => {
  state.currentDate.setFullYear(state.currentDate.getFullYear() - 1);
  renderApp();
});

dom.nextYear.addEventListener('click', () => {
  state.currentDate.setFullYear(state.currentDate.getFullYear() + 1);
  renderApp();
});

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

async function checkLogin() {
  try {
    const setupResponse = await fetch('/api/setup');
    const setup = await setupResponse.json();
    if (setup.needs_setup) {
      showSetupModal();
    } else {
      const userResponse = await fetch('/api/current_user', { credentials: 'include' });
      if (userResponse.ok) {
        state.currentUser = await userResponse.json();
        loadUserSettings();
        initializeApp();
      } else {
        showLoginModal();
      }
    }
  } catch (error) {
    console.error('Error checking login:', error);
    showLoginModal();
  }
}

function initializeApp() {
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    dom.yearSelect.appendChild(option);
  }
  setDateValue(formatISO(new Date()));

  if (isMobileDevice()) {
    dom.nativeDateInput.value = dom.date.value;
    dom.date.readOnly = true;
    dom.date.addEventListener('focus', openMobileDatePicker);
    dom.date.addEventListener('click', openMobileDatePicker);
    dom.date.addEventListener('keydown', (event) => {
      event.preventDefault();
      openMobileDatePicker();
    });
    dom.nativeDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        setDateValue(e.target.value);
      }
    });
  } else {
    datePicker = flatpickr(dom.date, {
      dateFormat: "Y-m-d",
      allowInput: true,
      clickOpens: true,
      defaultDate: dom.date.value
    });
  }
  
  initializeLocaleUI();
  initializeUserUI();
  updateLocaleMenu();
  applyLocaleTexts();
  if (state.currentUser.role === 'admin') {
    dom.openEventModal.style.display = 'block';
  } else {
    dom.openEventModal.style.display = 'none';
  }
  dom.openEventModal.addEventListener('click', () => showEventModal({ reset: true }));
  dom.closeEventModal.addEventListener('click', hideEventModal);
  dom.cancelEventButton.addEventListener('click', hideEventModal);
  dom.cost.addEventListener('input', () => {
    const sanitized = dom.cost.value.replace(/[^0-9.]/g, '');
    if (dom.cost.value !== sanitized) {
      dom.cost.value = sanitized;
    }
  });
  dom.modalOverlay.addEventListener('click', hideEventModal);
  
  // Delete confirmation modal handlers
  dom.deleteConfirmBtn.addEventListener('click', async () => {
    if (pendingDeleteId) {
      await removeEvent(pendingDeleteId);
    }
  });
  dom.deleteCancelBtn.addEventListener('click', hideDeleteConfirm);
  dom.deleteConfirmOverlay.addEventListener('click', hideDeleteConfirm);
  
  // Close delete confirmation on Escape key, confirm on Enter
  document.addEventListener('keydown', (e) => {
    if (dom.deleteConfirmModal.getAttribute('aria-hidden') === 'false') {
      if (e.key === 'Escape') {
        hideDeleteConfirm();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pendingDeleteId) {
          removeEvent(pendingDeleteId);
        }
      }
    }
  });
  
  // Timeline search functionality
  dom.timelineSearch.addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    buildTimelineItems(state.searchTerm);
    renderStats(state.searchTerm);
  });
  
  fetchEvents();
  renderApp();
}

function fetchActiveUsers() {
  const div = document.getElementById('active-users');
  if (!div) return;
  div.innerHTML = `<h4>${gettext('activeUsers')}</h4><div class="loading">${gettext('loading')}</div>`;
  fetch('/api/active_users', { credentials: 'include' })
    .then(r => r.json())
    .then(list => {
      div.innerHTML = `<h4>${gettext('activeUsers')}</h4>` + list.map(u => `<div>${u.username} (${gettext('fromIP')} ${u.ip})</div>`).join('');
    })
    .catch(err => {
      console.error('Failed to load active users:', err);
      div.innerHTML = `<h4>${gettext('activeUsers')}</h4><div>${gettext('errorLoading')}</div>`;
    });
}

function initializeUserUI() {
  dom.userButton.src = state.currentUser.role === 'admin' ? '/images/avatars/AdminUser.png' : '/images/avatars/DefaultUser.png';
  dom.userButton.style.display = 'block';
  dom.userButton.addEventListener('click', toggleUserMenu);
  document.addEventListener('click', (event) => {
    if (!dom.userButton.contains(event.target) && !dom.userMenu.contains(event.target)) {
      closeUserMenu();
    }
  });
  dom.userMenu.innerHTML = `
    <div class="current-user">${state.currentUser.username}</div>
    <button id="logout-button">${gettext('logout')}</button>
    <button id="change-password-button">${gettext('changePassword')}</button>
    ${state.currentUser.role === 'admin' ? `<button id="create-user-button">${gettext('createUser')}</button>` : ''}
    ${state.currentUser.role === 'admin' ? `<div class="active-users" id="active-users"><h4>${gettext('activeUsers')}</h4><div class="loading">${gettext('loading')}</div></div>` : ''}
  `;
  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('change-password-button').addEventListener('click', () => showChangePasswordModal());
  if (state.currentUser.role === 'admin') {
    document.getElementById('create-user-button').addEventListener('click', () => showCreateUserModal());
    fetchActiveUsers();
  }
}

function toggleUserMenu() {
  const isOpen = dom.userMenu.classList.toggle('open');
  dom.userButton.setAttribute('aria-expanded', String(isOpen));
  if (isOpen && state.currentUser.role === 'admin') {
    fetchActiveUsers();
  }
}

function closeUserMenu() {
  dom.userMenu.classList.remove('open');
  dom.userButton.setAttribute('aria-expanded', 'false');
}

async function logout() {
  await fetch('/api/logout', { credentials: 'include' });
  state.currentUser = null;
  location.reload();
}

function showLoginModal() {
  document.querySelector('#login-modal .section-title').textContent = gettext('loginTitle');
  document.querySelector('#login-modal-title').textContent = gettext('signInToContinue');
  document.querySelector('label[for="login-username"]').textContent = gettext('username');
  document.querySelector('label[for="login-password"]').textContent = gettext('password');
  document.querySelector('#login-form button[type="submit"]').textContent = gettext('loginButton');
  dom.loginModal.classList.add('open');
  dom.loginModal.setAttribute('aria-hidden', 'false');
  dom.loginUsername.focus();
}

function hideLoginModal() {
  dom.loginModal.classList.remove('open');
  dom.loginModal.setAttribute('aria-hidden', 'true');
}

function showSetupModal() {
  document.querySelector('#setup-modal .section-title').textContent = gettext('setupAdminTitle');
  document.querySelector('#setup-modal-title').textContent = gettext('createFirstAdmin');
  document.querySelector('label[for="setup-username"]').textContent = gettext('adminUsername');
  document.querySelector('label[for="setup-password"]').textContent = gettext('password');
  document.querySelector('#setup-form button[type="submit"]').textContent = gettext('createAdminButton');
  dom.setupModal.classList.add('open');
  dom.setupModal.setAttribute('aria-hidden', 'false');
  dom.setupUsername.focus();
}

function hideSetupModal() {
  dom.setupModal.classList.remove('open');
  dom.setupModal.setAttribute('aria-hidden', 'true');
}

function showChangePasswordModal() {
  document.querySelector('#change-password-modal .section-title').textContent = gettext('changePasswordTitle');
  document.querySelector('#change-password-modal-title').textContent = gettext('updateCredentials');
  document.querySelector('label[for="old-password"]').textContent = gettext('currentPassword');
  document.querySelector('label[for="new-password"]').textContent = gettext('newPassword');
  document.querySelector('#change-password-form button[type="submit"]').textContent = gettext('savePasswordButton');
  dom.changePasswordModal.classList.add('open');
  dom.changePasswordModal.setAttribute('aria-hidden', 'false');
  dom.oldPassword.focus();
}

function hideChangePasswordModal() {
  dom.changePasswordModal.classList.remove('open');
  dom.changePasswordModal.setAttribute('aria-hidden', 'true');
}

function showCreateUserModal() {
  document.querySelector('#create-user-modal .section-title').textContent = gettext('createUserTitle');
  document.querySelector('#create-user-modal-title').textContent = gettext('addReadOnlyUser');
  document.querySelector('label[for="create-user-username"]').textContent = gettext('username');
  document.querySelector('label[for="create-user-password"]').textContent = gettext('password');
  document.querySelector('label[for="create-user-role"]').textContent = gettext('role');
  document.querySelector('#create-user-role option[value="readonly"]').textContent = gettext('readOnly');
  document.querySelector('#create-user-form button[type="submit"]').textContent = gettext('createUserButton');
  dom.createUserModal.classList.add('open');
  dom.createUserModal.setAttribute('aria-hidden', 'false');
  dom.createUserUsername.focus();
}

function hideCreateUserModal() {
  dom.createUserModal.classList.remove('open');
  dom.createUserModal.setAttribute('aria-hidden', 'true');
}

dom.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = dom.loginUsername.value.trim();
  const password = dom.loginPassword.value;
  if (!username || !password) return;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    if (response.ok) {
      state.currentUser = await response.json();
      loadUserSettings();
      hideLoginModal();
      initializeApp();
    } else {
      showToast(gettext('invalidCredentials'), 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
  }
});

dom.setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = dom.setupUsername.value.trim();
  const password = dom.setupPassword.value;
  if (!username || !password) return;
  try {
    const response = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role: 'admin' }),
      credentials: 'include',
    });
    if (response.ok) {
      state.currentUser = await response.json();
      loadUserSettings();
      hideSetupModal();
      initializeApp();
    } else {
      showToast(gettext('setupFailed'), 'error');
    }
  } catch (error) {
    console.error('Setup error:', error);
  }
});

dom.changePasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const oldPassword = dom.oldPassword.value;
  const newPassword = dom.newPassword.value;
  if (!oldPassword || !newPassword) return;
  try {
    const response = await fetch('/api/change_password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      credentials: 'include'
    });
    if (response.ok) {
      showToast(gettext('passwordUpdated'), 'success');
      hideChangePasswordModal();
    } else {
      showToast(gettext('passwordUpdateFailed'), 'error');
    }
  } catch (error) {
    console.error('Change password error:', error);
  }
});

dom.createUserForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = dom.createUserUsername.value.trim();
  const password = dom.createUserPassword.value;
  const role = dom.createUserRole.value;
  if (!username || !password) return;
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
      credentials: 'include'
    });
    if (response.ok) {
      showToast(gettext('userCreated'), 'success');
      hideCreateUserModal();
    } else {
      showToast(gettext('createUserFailed'), 'error');
    }
  } catch (error) {
    console.error('Create user error:', error);
  }
});

dom.loginOverlay.addEventListener('click', hideLoginModal);
dom.setupOverlay.addEventListener('click', hideSetupModal);
dom.changePasswordOverlay.addEventListener('click', hideChangePasswordModal);
dom.createUserOverlay.addEventListener('click', hideCreateUserModal);

window.addEventListener('DOMContentLoaded', async () => {
  await loadLocales();
  await checkLogin();
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.modal.classList.contains('open')) {
      hideEventModal();
    }
  });

  // Refresh events periodically so all browsers stay in sync
  setInterval(() => {
    if (!dom.modal.classList.contains('open')) {
      fetchEvents();
    }
  }, POLL_INTERVAL_MS);

  // Check for yearly event resets every minute
  setInterval(checkAndResetYearlyEvents, 60000);

  // Refresh events again when the page returns to visibility
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchEvents();
      checkAndResetYearlyEvents();
    }
  });
});

