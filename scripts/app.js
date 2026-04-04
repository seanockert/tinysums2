// TinySums app — UI glue: textarea, results, localStorage, copy

import { evaluate } from './evaluator.js';
import { formatResult } from './formatter.js';
import { highlightAll } from './highlighter.js';
import { fetchRates } from './currency.js';

const SHEETS_KEY = 'tinysums';
const ACTIVE_KEY = 'tinysums_active';
const DEBOUNCE_MS = 300;

const DEFAULT_INPUT = `// Define values to use below
days = 15

// Define some variables
food: $12 x days
transport: $3.50 x days

// Add up all the above
sum

// Use units like kg
20kg plus 1900g

// Convert units
5km in miles
1.5tbsp in grams
2 cups in ml
1 gallon in l
68f to c
64mph in km/h

// Percentages
32% off $429
34/78 in percent

// Or compound interest
$4000.22 at 3% pa

// Convert currencies
1000 JPY in AUD

// Dates and timezones
today
weeks in 2026
15:30 GMT in AEST`;

// ============================================================
// DOM references
// ============================================================

const textarea = document.getElementById('input');
const highlightLayer = document.getElementById('highlight');
const highlightInner = document.createElement('div');
highlightLayer.appendChild(highlightInner);
const outputContainer = document.getElementById('output');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');
const addSheetBtn = document.getElementById('addSheet');
const sheetBar = document.getElementById('sheetBar');
const MOBILE_BP = 640;

// ============================================================
// State
// ============================================================

const state = {
  debounceTimer: null,
  rafPending: false,
  scrollRafPending: false,
  isMobile: window.innerWidth <= MOBILE_BP,
  toastTimer: null,
  activeResultLine: null,
  sheets: [],
  activeSheetId: null,
};

const metrics = {
  paddingTop: 0,
  paddingLeft: 0,
  lineHeight: 1,
  measureFont: '',
};

const measureCtx = document.createElement('canvas').getContext('2d');
const HAS_FIELD_SIZING = CSS.supports('field-sizing', 'content');

// ============================================================
// Sheets persistence
// ============================================================

function nextId() {
  const used = state.sheets.map(s => s.id);
  let id = 1;
  while (used.includes(id)) id++;
  return id;
}

function loadSheets() {
  const raw = localStorage.getItem(SHEETS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Migrate string IDs to simple numbers
      let needsMigration = parsed.some(s => typeof s.id !== 'number');
      if (needsMigration) {
        parsed.forEach((s, i) => { s.id = i + 1; });
      }
      state.sheets = parsed;
      // Prefer hash, then saved active, then first sheet
      const hashId = parseInt(location.hash.slice(1), 10);
      const savedId = parseInt(localStorage.getItem(ACTIVE_KEY), 10);
      state.activeSheetId =
        (hashId && state.sheets.find(s => s.id === hashId) ? hashId : null) ||
        (savedId && state.sheets.find(s => s.id === savedId) ? savedId : null) ||
        state.sheets[0]?.id;
      if (needsMigration) saveSheets();
      return;
    } catch {}
  }

  const sheet = { id: 1, content: DEFAULT_INPUT, lastEdited: Date.now() };
  state.sheets = [sheet];
  state.activeSheetId = sheet.id;
  saveSheets();
}

function saveSheets() {
  localStorage.setItem(SHEETS_KEY, JSON.stringify(state.sheets));
  localStorage.setItem(ACTIVE_KEY, state.activeSheetId);
  syncHash();
}

function syncHash() {
  const target = '#' + state.activeSheetId;
  if (location.hash !== target) {
    history.replaceState(null, '', target);
  }
}

function getActiveSheet() {
  return state.sheets.find(s => s.id === state.activeSheetId);
}

function sortedInactiveSheets() {
  return state.sheets
    .filter(s => s.id !== state.activeSheetId)
    .sort((a, b) => b.lastEdited - a.lastEdited);
}

// ============================================================
// Core update loop
// ============================================================

function syncVisuals() {
  if (state.rafPending) return;
  state.rafPending = true;
  requestAnimationFrame(() => {
    highlightInner.innerHTML = highlightAll(textarea.value);
    autoResize();
    state.rafPending = false;
  });
}

function evalAndRender() {
  const input = textarea.value;
  const results = evaluate(input);
  renderOutput(results);
  updateMobilePadding();
}

function saveActiveSheet() {
  const sheet = getActiveSheet();
  if (!sheet) return;
  sheet.content = textarea.value;
  sheet.lastEdited = Date.now();
  saveSheets();
}

function evalAndSave() {
  evalAndRender();
  saveActiveSheet();
  renderSheetBar();
}

function updateMobilePadding() {
  if (!state.isMobile) {
    textarea.style.paddingRight = '';
    return;
  }

  if (!metrics.measureFont) {
    const style = getComputedStyle(textarea);
    metrics.measureFont = `${style.fontSize} ${style.fontFamily}`;
  }
  measureCtx.font = metrics.measureFont;

  const textareaWidth = textarea.clientWidth;
  const maxOverlap = textarea.value.split('\n').reduce((max, line, i) => {
    const resultEl = outputContainer.children[i];
    if (!resultEl?.firstChild) return max;
    const overlap = measureCtx.measureText(line).width + metrics.paddingLeft + resultEl.offsetWidth - textareaWidth;
    return overlap > max ? overlap : max;
  }, 0);

  textarea.style.paddingRight = maxOverlap > 0 ? (maxOverlap + 16) + 'px' : '';
}

function renderOutput(results) {
  const existing = outputContainer.children;

  for (let i = 0; i < results.length; i++) {
    const formatted = formatResult(results[i]);
    const div = existing[i] || outputContainer.appendChild(
      Object.assign(document.createElement('div'), { className: 'result-line' })
    );
    const btn = div.firstChild;
    if (formatted) {
      if (btn && btn.tagName === 'BUTTON') {
        if (btn.textContent !== formatted) {
          btn.textContent = formatted;
          btn.onclick = () => copyToClipboard(formatted);
        }
      } else {
        div.innerHTML = '';
        const newBtn = document.createElement('button');
        newBtn.className = 'result-value';
        newBtn.textContent = formatted;
        newBtn.title = 'Click to copy';
        newBtn.onclick = () => copyToClipboard(formatted);
        div.appendChild(newBtn);
      }
    } else if (btn) {
      div.innerHTML = '';
    }
  }

  while (existing.length > results.length) {
    outputContainer.removeChild(outputContainer.lastChild);
  }
}

function autoResize() {
  if (!HAS_FIELD_SIZING) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
}

// ============================================================
// Sheet bar
// ============================================================

function sheetPreview(sheet) {
  const firstLine = (sheet.content || '').split('\n').find(l => l.trim()) || 'Empty sheet';
  return firstLine.slice(0, 50);
}

function renderSheetBar() {
  const inactive = sortedInactiveSheets();
  const existing = sheetBar.children;

  for (let i = 0; i < inactive.length; i++) {
    const sheet = inactive[i];
    let tab = existing[i];
    if (!tab) {
      tab = document.createElement('div');
      tab.className = 'sheet-tab';
      sheetBar.appendChild(tab);
    }
    const label = sheetPreview(sheet);
    // Only rebuild inner content if sheet changed
    if (tab.dataset.id !== sheet.id || tab.dataset.label !== label) {
      tab.dataset.id = sheet.id;
      tab.dataset.label = label;
      tab.innerHTML = '';
      tab.appendChild(document.createTextNode(label));
      const del = document.createElement('button');
      del.className = 'delete-sheet';
      del.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="1.5" height="16" width="16" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>';
      del.title = 'Delete sheet';
      del.onclick = (e) => { e.stopPropagation(); deleteSheet(sheet.id); };
      tab.appendChild(del);
    }
    tab.onclick = () => switchToSheet(sheet.id);
  }

  while (existing.length > inactive.length) {
    sheetBar.removeChild(sheetBar.lastChild);
  }
}

function switchToSheet(id) {
  if (id === state.activeSheetId) return;
  // Save current content first
  saveActiveSheet();

  state.activeSheetId = id;
  const sheet = getActiveSheet();
  textarea.value = sheet.content;
  syncVisuals();
  evalAndRender();
  // Push to history so back/forward navigates between sheets
  const target = '#' + id;
  if (location.hash !== target) {
    history.pushState(null, '', target);
  }
  localStorage.setItem(ACTIVE_KEY, state.activeSheetId);
  renderSheetBar();
  textarea.focus();
}

function addSheet() {
  saveActiveSheet();
  const sheet = { id: nextId(), content: '', lastEdited: Date.now() };
  state.sheets.push(sheet);
  state.activeSheetId = sheet.id;
  textarea.value = '';
  syncVisuals();
  evalAndRender();
  saveSheets();
  renderSheetBar();
  textarea.focus();
}

function deleteSheet(id) {
  if (state.sheets.length <= 1) return;
  if (!confirm('Delete this sheet?')) return;

  const idx = state.sheets.findIndex(s => s.id === id);
  state.sheets.splice(idx, 1);

  // If we deleted the active sheet, switch to the most recent one
  if (id === state.activeSheetId) {
    const sorted = [...state.sheets].sort((a, b) => b.lastEdited - a.lastEdited);
    state.activeSheetId = sorted[0].id;
    const sheet = getActiveSheet();
    textarea.value = sheet.content;
    syncVisuals();
    evalAndRender();
  }

  saveSheets();
  renderSheetBar();
  textarea.focus();
}

// ============================================================
// Clipboard
// ============================================================

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast();
  } catch (e) {
    const tmp = document.createElement('textarea');
    tmp.value = text;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    showToast();
  }
}

function showToast() {
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 1200);
}

// ============================================================
// Theme
// ============================================================

const THEME_KEY = 'tinysums_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ============================================================
// Event listeners
// ============================================================

textarea.addEventListener('input', () => {
  syncVisuals();
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(evalAndSave, DEBOUNCE_MS);
});

textarea.addEventListener('scroll', () => {
  if (state.scrollRafPending) return;
  state.scrollRafPending = true;
  requestAnimationFrame(() => {
    if (state.isMobile) {
      highlightInner.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    } else {
      highlightLayer.scrollTop = textarea.scrollTop;
      highlightLayer.scrollLeft = textarea.scrollLeft;
    }
    state.scrollRafPending = false;
  });
});

function cacheTextareaMetrics() {
  const style = getComputedStyle(textarea);
  metrics.paddingTop = parseFloat(style.paddingTop);
  metrics.paddingLeft = parseFloat(style.paddingLeft);
  metrics.lineHeight = parseFloat(style.lineHeight);
  metrics.measureFont = `${style.fontSize} ${style.fontFamily}`;
}

textarea.addEventListener('mousemove', (e) => {
  const y = e.clientY - textarea.getBoundingClientRect().top - metrics.paddingTop + textarea.scrollTop;
  const resultLine = outputContainer.children[Math.floor(y / metrics.lineHeight)] || null;
  if (resultLine === state.activeResultLine) return;
  if (state.activeResultLine) state.activeResultLine.classList.remove('active');
  if (resultLine) resultLine.classList.add('active');
  state.activeResultLine = resultLine;
});

textarea.addEventListener('mouseleave', () => {
  if (state.activeResultLine) {
    state.activeResultLine.classList.remove('active');
    state.activeResultLine = null;
  }
});

addSheetBtn.addEventListener('click', addSheet);

window.addEventListener('hashchange', () => {
  const hashId = parseInt(location.hash.slice(1), 10);
  if (hashId && hashId !== state.activeSheetId && state.sheets.find(s => s.id === hashId)) {
    switchToSheet(hashId);
  }
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  initTheme();
  loadSheets();
  const sheet = getActiveSheet();
  textarea.value = sheet.content;
  syncVisuals();
  cacheTextareaMetrics();
  evalAndRender();
  renderSheetBar();
  window.addEventListener('resize', () => {
    state.isMobile = window.innerWidth <= MOBILE_BP;
    if (!state.isMobile) highlightInner.style.transform = '';
    cacheTextareaMetrics();
    updateMobilePadding();
  });
  textarea.focus();

  // Fetch currency rates in background, re-evaluate when ready
  const success = await fetchRates();
  if (success) evalAndRender();
}

init();
