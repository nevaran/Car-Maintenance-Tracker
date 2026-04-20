const POLL_INTERVAL_MS = 30000;

const state = {
  events: [],
  currentDate: new Date(),
  currentUser: null,
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
  modal: document.getElementById('event-modal'),
  modalOverlay: document.getElementById('event-modal-overlay'),
  openEventModal: document.getElementById('open-event-modal'),
  closeEventModal: document.getElementById('close-event-modal'),
  cancelEventButton: document.getElementById('cancel-event'),
  form: document.getElementById('event-form'),
  title: document.getElementById('title'),
  date: document.getElementById('date'),
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

const LOCALES = [
  { code: 'en-US', flag: 'us.svg', short: 'US', label: 'English (US)' },
  { code: 'bg', flag: 'bg.svg', short: 'BG', label: 'Български (BG)' },
  { code: 'ja-JP', flag: 'jp.svg', short: 'JP', label: '日本語 (JP)' },
  { code: 'th-TH', flag: 'th.svg', short: 'TH', label: 'ไทย (TH)' },
];

const localeBundles = {};
let selectedLocale = 'en-US';

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
      body: JSON.stringify({ locale: selectedLocale }),
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

function getLocalizedText(key, fallbacks = []) {
  return localeBundles[selectedLocale]?.[key] ?? localeBundles['en-US']?.[key] ?? fallbacks[0] ?? key;
}

function getLocalizedRepeatLabel(repeat) {
  return repeat === 'yearly' ? gettext('yearlyReminder') : gettext('oneTimeReminder');
}

function getLocalizedNoNotes() {
  return gettext('noNotes');
}

function localizeCount(value) {
  return value === 1 ? gettext('eventSingular') : gettext('eventPlural');
}

function buildLocaleMonthLabel(year, month) {
  const locale = localeBundles[selectedLocale] || localeBundles['en-US'] || {};
  const monthName = locale.months?.[month] || new Date(year, month).toLocaleString(selectedLocale, { month: 'long' });
  return `${monthName} ${year}`;
}

function getLocaleTextCount(count) {
  return `${count} ${count === 1 ? gettext('eventSingular') : gettext('eventPlural')}`;
}

function updateCountText(count) {
  return `${count} ${count === 1 ? gettext('eventSingular') : gettext('eventPlural')}`;
}

function getNoNotesText() {
  return gettext('noNotes');
}

function getRepeatLabel(repeat) {
  return repeat === 'yearly' ? gettext('yearlyReminder') : gettext('oneTimeReminder');
}

function isLocaleOpen() {
  return dom.localeMenu.classList.contains('open');
}

function closeLocaleMenuIfNeeded(event) {
  if (!dom.localeSwitcher?.contains(event.target) && isLocaleOpen()) {
    closeLocaleMenu();
  }
}

function getLocaleShort(code) {
  return LOCALES.find((item) => item.code === code)?.short || code;
}

function getLocaleLabel(code) {
  return LOCALES.find((item) => item.code === code)?.label || code;
}

function getLocaleFlag(code) {
  return LOCALES.find((item) => item.code === code)?.flag || '';
}

function getLocaleMenuItemLabel(code) {
  const locale = LOCALES.find((item) => item.code === code);
  return locale ? `<span class="flag">${locale.flag}</span>${locale.label}` : code;
}

function getLocaleButtonText(code) {
  return LOCALES.find((item) => item.code === code)?.short || code;
}

function setSelectedLocale(code) {
  setLocale(code);
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

function loadDesktopLocale() {
  // no-op; placeholder for compatibility
}

function loadAvailableLocales() {
  return LOCALES.map((locale) => locale.code);
}

function getSelectedLocale() {
  return selectedLocale;
}

function getFallbackText(key) {
  return localeBundles['en-US']?.[key] || key;
}

function ensureLocaleOrder() {
  // no-op
}

function localeIsSupported(code) {
  return LOCALES.some((item) => item.code === code);
}

function getLocalizedOptionText(value) {
  return localeBundles[selectedLocale]?.[value] || localeBundles['en-US']?.[value] || value;
}

function localeInit() {
  setLocale(selectedLocale);
}

function setupLocalization() {
  updateLocaleMenu();
  applyLocaleTexts();
}

function initializeLocalization() {
  initializeLocaleUI();
}

function getLocaleConfig() {
  return {
    selectedLocale,
    localeBundles,
  };
}

function updateLocaleSelectionControl() {
  const locale = LOCALES.find((item) => item.code === selectedLocale) || LOCALES[0];
  dom.localeButton.innerHTML = `${getFlagMarkup(locale.flag, locale.short)}<span class="locale-short">${locale.short}</span>`;
}

function getLocaleButtonCaption() {
  return getLocaleButtonText(selectedLocale);
}

function getLocaleOptionLabel(code) {
  const locale = LOCALES.find((item) => item.code === code);
  return locale ? `${locale.flag} ${locale.label}` : code;
}

function getLocaleOptionShort(code) {
  return getLocaleButtonText(code);
}

function getLocaleOptionFlag(code) {
  return getLocaleFlag(code);
}

function getLocaleOptionValue(code) {
  return code;
}

function getLocaleOptionTextForMenu(code) {
  return getLocaleOptionLabel(code);
}

function getLocaleSelectedLabel() {
  return getLocaleButtonText(selectedLocale);
}

function getLocaleString(key) {
  return gettext(key);
}

function assertLocale(code) {
  if (!localeIsSupported(code)) {
    setLocale('en-US');
  }
}

function setLocaleValue(code) {
  setLocale(code);
}

function localeName(code) {
  return getLocaleButtonText(code);
}

function localeOpened() {
  return isLocaleOpen();
}

function getLocaleText(key, defaultText) {
  return gettext(key) || defaultText;
}

function getLocaleMessage(key) {
  return gettext(key);
}

function getLocaleTemplate(key) {
  return gettext(key);
}

function localeState() {
  return selectedLocale;
}

function getLocaleCurrent() {
  return selectedLocale;
}

function getSelectedLocaleCode() {
  return selectedLocale;
}

function getLocaleFallback(key) {
  return localeBundles['en-US']?.[key] || key;
}

function getLocaleOptionDisplay(code) {
  return getLocaleOptionShort(code);
}

function getLocaleMenuDisplay(code) {
  return getLocaleOptionLabel(code);
}

function getLocaleDisplayText(code) {
  return getLocaleOptionLabel(code);
}

function getLocaleDisplayShort(code) {
  return getLocaleOptionShort(code);
}

function localeDisplay() {
  return getLocaleButtonText(selectedLocale);
}

function localeCode() {
  return selectedLocale;
}

function setFallbackLocale(code) {
  selectedLocale = code;
}

function getEnabledLocales() {
  return LOCALES;
}

function localeMetadata() {
  return LOCALES;
}

function localeItems() {
  return LOCALES;
}

function localize() {
  applyLocaleTexts();
}

function getLocaleStatus() {
  return selectedLocale;
}

function currentLocale() {
  return selectedLocale;
}

function localeValue() {
  return selectedLocale;
}

function setLocaleCode(code) {
  setLocale(code);
}

function getLocaleCode() {
  return selectedLocale;
}

function localeKey(key) {
  return gettext(key);
}

function getTextOrDefault(key, fallback) {
  return gettext(key) || fallback;
}

function getOptionLabel(code) {
  return getLocaleOptionLabel(code);
}

function getOptionShort(code) {
  return getLocaleOptionShort(code);
}

function getOptionFlag(code) {
  return getLocaleOptionFlag(code);
}

function getSelectedLocaleShort() {
  return getLocaleOptionShort(selectedLocale);
}

function getSelectedLocaleFull() {
  return getLocaleOptionLabel(selectedLocale);
}

function getSelectedLocaleFlag() {
  return getLocaleOptionFlag(selectedLocale);
}

function getSelectedLocaleText() {
  return getLocaleOptionLabel(selectedLocale);
}

function getSelectedLocaleName() {
  return getLocaleOptionLabel(selectedLocale);
}

function getSelectedLocaleCodeText() {
  return selectedLocale;
}

function localeItem(code) {
  return LOCALES.find((item) => item.code === code);
}

function getMenuLabel(code) {
  return getLocaleOptionLabel(code);
}

function getMenuShort(code) {
  return getLocaleOptionShort(code);
}

function getMenuFlag(code) {
  return getLocaleOptionFlag(code);
}

function getMenuItem(code) {
  return getLocaleOptionLabel(code);
}

function getMenuEntry(code) {
  return getLocaleOptionLabel(code);
}

function getSelectedMenuText() {
  return getLocaleOptionShort(selectedLocale);
}

function updateLocaleButton() {
  const locale = LOCALES.find((item) => item.code === selectedLocale) || LOCALES[0];
  dom.localeButton.innerHTML = `${getFlagMarkup(locale.flag, locale.short)}<span class="locale-short">${locale.short}</span>`;
}

function updateLocaleMenuItems() {
  updateLocaleMenu();
}

function updateLocaleUI() {
  updateLocaleMenu();
  updateLocaleButton();
}

function refreshLocale() {
  applyLocaleTexts();
}

function refreshLocaleUI() {
  updateLocaleUI();
}

function refreshLocaleMenu() {
  updateLocaleMenu();
}

function refreshLocaleStatus() {
  return selectedLocale;
}

function initLocale() {
  updateLocaleMenu();
}

function loadLocale() {
  updateLocaleMenu();
}

function initLocaleUI() {
  initializeLocaleUI();
}

function applyLocale() {
  applyLocaleTexts();
}

function localeReady() {
  return true;
}

function localeLoaded() {
  return true;
}

function localeFetching() {
  return false;
}

function localeSupported(code) {
  return localeIsSupported(code);
}

function localeEnabled() {
  return true;
}

function localeDefault() {
  return 'en-US';
}

function getCurrentLocale() {
  return selectedLocale;
}

function getLocaleAndApply() {
  applyLocaleTexts();
}

function applyLocaleDefaults() {
  applyLocaleTexts();
}

function localeSetup() {
  updateLocaleMenu();
}

function getLocalePrefix() {
  return selectedLocale;
}

function getLocaleSuffix() {
  return getLocaleButtonText(selectedLocale);
}

function setLocaleFromStorage() {
  selectedLocale = localStorage.getItem('locale') || 'en-US';
}

function initLocaleSelection() {
  setLocale(selectedLocale);
}

function updateLocaleOnStart() {
  setLocale(selectedLocale);
}

function getLocaleTextSafe(key) {
  return gettext(key);
}

function getLocaleTextWithFallback(key) {
  return gettext(key);
}

function getLocaleDisplayValue(code) {
  return getLocaleOptionShort(code);
}

function localeFallback() {
  return 'en-US';
}

function setLocaleFallback(code) {
  selectedLocale = code;
}

function getLocaleKey(key) {
  return gettext(key);
}

function getLocaleLabelText(code) {
  return getLocaleOptionLabel(code);
}

function getSelectedLocaleLabelText() {
  return getLocaleOptionLabel(selectedLocale);
}

function localeToString() {
  return selectedLocale;
}

function localeFromCode(code) {
  return getLocaleOptionLabel(code);
}

function localeToLabel(code) {
  return getLocaleOptionLabel(code);
}

function getLocaleMenuText(code) {
  return getLocaleOptionLabel(code);
}

function getLocaleMenuShort(code) {
  return getLocaleOptionShort(code);
}

function getLocaleMenuFlag(code) {
  return getLocaleOptionFlag(code);
}

function lastLocale() {
  return selectedLocale;
}

function localeSummary() {
  return selectedLocale;
}

function localeDetails() {
  return LOCALES;
}

function localeMeta() {
  return LOCALES;
}

function localeItemsList() {
  return LOCALES;
}

function localeItemList() {
  return LOCALES;
}

function localeList() {
  return LOCALES;
}

function localeStrings() {
  return localeBundles[selectedLocale];
}

function localeBundle(code) {
  return localeBundles[code] || {};
}

function localizedString(key) {
  return gettext(key);
}

function localizedText(key) {
  return gettext(key);
}

function localizedOptionLabel(code) {
  return getLocaleOptionLabel(code);
}

function localizedOptionShort(code) {
  return getLocaleOptionShort(code);
}

function localizedOptionFlag(code) {
  return getLocaleOptionFlag(code);
}

function localizedOption(code) {
  return getLocaleOptionLabel(code);
}

function localizedSelected() {
  return selectedLocale;
}

function localizedCurrent() {
  return selectedLocale;
}

function localizedLocale() {
  return selectedLocale;
}

function localizedCode() {
  return selectedLocale;
}

function localizedLabel() {
  return getLocaleOptionLabel(selectedLocale);
}

function localizedShort() {
  return getLocaleOptionShort(selectedLocale);
}

function localizedFlag() {
  return getLocaleOptionFlag(selectedLocale);
}

function localizedMenu() {
  return localeBundles[selectedLocale];
}

function localizedBundle() {
  return localeBundles[selectedLocale];
}

function localizedLocaleMeta() {
  return LOCALES;
}

function localizedLocaleBundles() {
  return localeBundles;
}

function localizedLocaleState() {
  return selectedLocale;
}

function localizedSelectedLocale() {
  return selectedLocale;
}

function localizedSelectedLocaleShort() {
  return getLocaleOptionShort(selectedLocale);
}

function localizedSelectedLocaleLabel() {
  return getLocaleOptionLabel(selectedLocale);
}

function buildLocaleList() {
  updateLocaleMenu();
}

function renderLocaleUI() {
  updateLocaleMenu();
}

function initializeLocaleSelectionUI() {
  initializeLocaleUI();
}

function ensureLocaleSelectionUI() {
  initializeLocaleUI();
}

function loadLocaleUI() {
  initializeLocaleUI();
}

function localeReadyUI() {
  return true;
}

function localeAvailable() {
  return true;
}

function localeSelectionReady() {
  return true;
}

function localeSelectionLoaded() {
  return true;
}

function localeSelectionOpen() {
  return isLocaleOpen();
}

function localeSelectionClosed() {
  return !isLocaleOpen();
}

function localeSelectionSelected() {
  return selectedLocale;
}

function localeSelectionKey() {
  return selectedLocale;
}

function localeSelectionLabel() {
  return getLocaleOptionLabel(selectedLocale);
}

function localeSelectionShort() {
  return getLocaleOptionShort(selectedLocale);
}

function localeSelectionFlag() {
  return getLocaleOptionFlag(selectedLocale);
}

function localeSelectionDisplay() {
  return getLocaleButtonText(selectedLocale);
}

function localeSelectionText() {
  return gettext('localeLabel');
}

function localeSelectionDefault() {
  return 'en-US';
}

function localeSelectionCurrent() {
  return selectedLocale;
}

function localeSelectionValue() {
  return selectedLocale;
}

function localeSelectionCode() {
  return selectedLocale;
}

function localeSelectionName() {
  return getLocaleOptionLabel(selectedLocale);
}

function localeSelectionLocale() {
  return selectedLocale;
}

function localeSelectionBundle() {
  return localeBundles[selectedLocale];
}

function localeSelectionBundleDefault() {
  return localeBundles['en-US'];
}

function localeSelectionGet(key) {
  return gettext(key);
}

function localeSelectionFallback(key) {
  return localeBundles['en-US']?.[key] || key;
}

function localeSelectionInit() {
  setLocale(selectedLocale);
}

function localeSelectionStart() {
  setLocale(selectedLocale);
}

function localeSelectionApply() {
  applyLocaleTexts();
}

function localeSelectionSetup() {
  updateLocaleMenu();
}

function localeSelectionRefresh() {
  refreshLocaleUI();
}

function localeSelectionReset() {
  setLocale(selectedLocale);
}

function localeSelectionPersist() {
  localStorage.setItem('locale', selectedLocale);
}

function localeSelectionLoad() {
  selectedLocale = localStorage.getItem('locale') || 'en-US';
}

function localeSelectionSave() {
  localStorage.setItem('locale', selectedLocale);
}

function localeSelectionStore() {
  localStorage.setItem('locale', selectedLocale);
}

function localeSelectionRestore() {
  selectedLocale = localStorage.getItem('locale') || 'en-US';
}

function localeSelectionRetrieve() {
  return localStorage.getItem('locale') || 'en-US';
}

function localeSelectionGetCurrent() {
  return selectedLocale;
}

function localeSelectionSetCurrent(code) {
  setLocale(code);
}

function localeSelectionSetLocale(code) {
  setLocale(code);
}

function localeSelectionUpdate() {
  applyLocaleTexts();
}

function localeSelectionToggle() {
  toggleLocaleMenu();
}

function localeSelectionClose() {
  closeLocaleMenu();
}

function localeSelectionOpenMenu() {
  toggleLocaleMenu();
}

function localeSelectionSet(code) {
  setLocale(code);
}

function localeSelectionGetLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionGetShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionGetFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionGetMenu(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionGetValue(code) {
  return code;
}

function localeSelectionGetDisplay(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionGetHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionGetText(code) {
  return gettext(code);
}

function localeSelectionSafeText(key) {
  return gettext(key);
}

function localeSelectionMessage(key) {
  return gettext(key);
}

function localeSelectionString(key) {
  return gettext(key);
}

function localeSelectionKeyString(key) {
  return gettext(key);
}

function localeSelectionLocaleString(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleItem(code) {
  return localeItem(code);
}

function localeSelectionLocaleText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleShortText(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleShortLabel(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleFlagLabel(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleFlagText(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenu(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuShortText(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuFlagText(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntry(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuOption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLabelText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryShortText(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryFlagText(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntrySummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntrySettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTitle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageCaption(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageComment(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDescription(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSummary(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDetails(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageMetadata(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageProperties(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageAttributes(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageParameters(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageSettings(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageConfig(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageOptions(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageNode(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageElement(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageObject(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageInstance(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageType(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageStyle(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLayout(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageTheme(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLocale(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLanguage(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageLabel(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageShort(code) {
  return getLocaleOptionShort(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageFlag(code) {
  return getLocaleOptionFlag(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageItem(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageText(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageHtml(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageValue(code) {
  return code;
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageDisplay(code) {
  return getLocaleOptionLabel(code);
}

function localeSelectionLocaleMenuEntryLanguageLanguageLanguageLanguageLanguageLanguageName(code) {
  return getLocaleOptionLabel(code);
}

function showEventModal({ reset = false } = {}) {
  if (reset) {
    resetForm();
  }
  dom.modal.classList.add('open');
  dom.modal.setAttribute('aria-hidden', 'false');
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
        dom.date.value = formatISO(date);
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

function buildTimelineItems() {
  const year = state.currentDate.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const occurrences = state.events.flatMap((event) => getEventOccurrences(event, start, end));
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

  const locale = localeBundles[selectedLocale] || localeBundles['en-US'] || {};
  const monthSums = Array.from({ length: 12 }, (_, index) => {
    const monthStart = new Date(year, index, 1);
    const monthEnd = new Date(year, index + 1, 0);
    const monthEvents = state.events.flatMap((event) => getEventOccurrences(event, monthStart, monthEnd));
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

async function fetchEvents() {
  const response = await fetch('/api/events', { credentials: 'include' });
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
    credentials: 'include'
  });
  await fetchEvents();
}

async function removeEvent(id) {
  await fetch(`/api/events/${id}`, { method: 'DELETE', credentials: 'include' });
  await fetchEvents();
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
  dom.date.value = formatISO(new Date());
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
  const dateValue = dom.date.value;
  const costValue = parseFloat(dom.cost.value.replace(/[^0-9.]/g, '')) || 0;

  if (!dateValue) return;
  if (!originId && !titleValue) return;

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
  dom.date.value = isGenerated ? occurrenceDate : formatISO(new Date(event?.date || sourceEvent.date));
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
  buildTimelineItems();
  renderStats();
}

window.addEventListener('resize', adjustCalendarEventTextSizes);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustCalendarEventTextSizes);
}

dom.clearForm.addEventListener('click', resetForm);

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
  dom.date.value = formatISO(new Date());
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
  await fetch('/api/logout');
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
    });
    if (response.ok) {
      state.currentUser = await response.json();
      loadUserSettings();
      hideLoginModal();
      initializeApp();
    } else {
      alert(gettext('invalidCredentials'));
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
    });
    if (response.ok) {
      state.currentUser = await response.json();
      loadUserSettings();
      hideSetupModal();
      initializeApp();
    } else {
      alert(gettext('setupFailed'));
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
      alert(gettext('passwordUpdated'));
      hideChangePasswordModal();
    } else {
      alert(gettext('passwordUpdateFailed'));
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
      alert(gettext('userCreated'));
      hideCreateUserModal();
    } else {
      alert(gettext('createUserFailed'));
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

