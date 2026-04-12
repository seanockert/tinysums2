import { evaluate, getGrammarAndSemantics } from './evaluator.js';
import { formatResult } from './formatter.js';
import { highlightAll } from './highlighter.js';
import { fetchRates } from './currency.js';
import { initTypingDemo } from './typing-demo.js';

const SHEETS_KEY = 'sumthing';
const DEBOUNCE_MS = 300;

const DEFAULT_INPUT = `// Convert units
5km in miles
1.5tbsp in grams
2 cups in ml
How many cups in 1500 ml
1 gallon in l
68f to c
64mph in km/h

// Add different units
20kg plus 1900g

// Define values to reuse
days = 15

// Define some variables
food: $12 x days
transport: $3.50 x days

// Add up all the above
sum

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

const textarea = document.getElementById('input');
const highlightLayer = document.getElementById('highlight');
const highlightInner = document.createElement('div');
highlightLayer.appendChild(highlightInner);
const outputContainer = document.getElementById('output');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');
const addSheetBtn = document.getElementById('addSheet');
const sheetBar = document.getElementById('sheetBar');
const introDialog = document.getElementById('intro');
const helpDialog = document.getElementById('help');
const helpBtn = document.getElementById('helpBtn');
const typingDemo = document.getElementById('typingDemo');
const heading = document.querySelector('h1');
const MOBILE_BP = 640;

function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeContent(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

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

const lockBody = (lock) => document.body.style.overflow = lock ? 'hidden' : '';

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
      let needsMigration = parsed.some(s => typeof s.id !== 'number');
      if (needsMigration) parsed.forEach((s, i) => { s.id = i + 1; });
      state.sheets = parsed;
      if (needsMigration) saveSheets();
    } catch {
      state.sheets = [];
    }
  }

  const hash = location.hash.slice(1);
  if (hash) {
    try {
      const content = decodeContent(hash);
      const existing = state.sheets.find(s => s.content === content);
      if (existing) {
        state.activeSheetId = existing.id;
        return;
      }
      const sheet = { id: nextId(), content, lastEdited: Date.now() };
      state.sheets.push(sheet);
      state.activeSheetId = sheet.id;
      saveSheets();
      return;
    } catch {}
  }

  if (state.sheets.length) {
    state.activeSheetId = state.sheets[0].id;
    return;
  }

  const sheet = { id: 1, content: DEFAULT_INPUT, lastEdited: Date.now() };
  state.sheets = [sheet];
  state.activeSheetId = sheet.id;
  saveSheets();
}

function saveSheets() {
  localStorage.setItem(SHEETS_KEY, JSON.stringify(state.sheets));
  syncHash();
}

function syncHash() {
  const sheet = getActiveSheet();
  if (!sheet) return;
  const target = '#' + encodeContent(sheet.content);
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

  const containerWidth = textarea.parentElement.clientWidth;
  let maxOverlap = 0;
  let maxLineWidth = 0;

  textarea.value.split('\n').forEach((line, i) => {
    const textWidth = measureCtx.measureText(line).width;
    if (textWidth > maxLineWidth) maxLineWidth = textWidth;
    const resultEl = outputContainer.children[i];
    if (!resultEl?.firstChild) return;
    const overlap = textWidth + metrics.paddingLeft + resultEl.offsetWidth - containerWidth;
    if (overlap > maxOverlap) maxOverlap = overlap;
  });

  if (maxOverlap > 0) {
    const naturalScroll = maxLineWidth + metrics.paddingLeft - containerWidth;
    const needed = maxOverlap + 16 - naturalScroll;
    textarea.style.paddingRight = needed > 0 ? needed + 'px' : '';
  } else {
    textarea.style.paddingRight = '';
  }
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

function sheetPreview(sheet) {
  const firstLine = (sheet.content || '').split('\n').find(l => l.trim()) || 'Empty sheet';
  const firstLineWithoutComment = firstLine.replace(/^\/\//, '');
  return firstLineWithoutComment.slice(0, 50);
}

function renderSheetBar() {
  const inactive = sortedInactiveSheets();
  const existing = sheetBar.children;

  for (let i = 0; i < inactive.length; i++) {
    const sheet = inactive[i];
    let tab = existing[i];
    if (!tab) {
      tab = document.createElement('button');
      tab.className = 'sheet-tab';
      sheetBar.appendChild(tab);
    }
    const label = sheetPreview(sheet);
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
  saveActiveSheet();

  state.activeSheetId = id;
  const sheet = getActiveSheet();
  textarea.value = sheet.content;
  syncVisuals();
  evalAndRender();
  saveSheets();
  renderSheetBar();
  textarea.focus();
}

function addSheet() {
  saveActiveSheet();
  const defaultContent = `// New sheet\n1 x 2`;
  const sheet = { id: nextId(), content: defaultContent, lastEdited: Date.now() };
  state.sheets.push(sheet);
  state.activeSheetId = sheet.id;
  textarea.value = defaultContent;
  syncVisuals();
  evalAndRender();
  saveSheets();
  renderSheetBar();
  textarea.focus();
}

function deleteSheet(id) {
  if (state.sheets.length <= 1) return;

  const idx = state.sheets.findIndex(s => s.id === id);
  if (idx === -1) return;
  if (state.sheets[idx].content.trim() !== '') {
    if (!confirm('Delete this sheet?')) return;
  }
  
  state.sheets.splice(idx, 1);

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

function getSelectedLineRange() {
  const text = textarea.value;
  let { selectionStart, selectionEnd } = textarea;
  if (selectionStart === selectionEnd) {
    selectionStart = 0;
    selectionEnd = text.length;
  }
  const start = text.slice(0, selectionStart).split('\n').length - 1;
  const end = text.slice(0, selectionEnd).split('\n').length - 1;
  return { start, end };
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
  showToast();
}

function showToast() {
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 1200);
}

const THEME_KEY = 'sumthing_theme';

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
  const next = current === 'dark' ? 'light' : 'dark';
  const isIOS = /iPad|iPhone/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!document.startViewTransition || isIOS) {
    applyTheme(next);
    return;
  }
  document.startViewTransition(() => applyTheme(next));
});

textarea.addEventListener('copy', (e) => {
  const results = evaluate(textarea.value);
  const lines = textarea.value.split('\n');
  const { start, end } = getSelectedLineRange();
  const enriched = lines.map((line, i) => {
    if (i < start || i > end) return line;
    const formatted = formatResult(results[i]);
    return formatted ? `${line},${formatted}` : line;
  });
  e.clipboardData.setData('text/plain', enriched.slice(start, end + 1).join('\n'));
  e.preventDefault();
});

textarea.addEventListener('paste', (e) => {
  const pasted = e.clipboardData.getData('text/plain');
  if (!pasted.includes(',')) return; // no commas, nothing to strip
  const { grammar } = getGrammarAndSemantics();
  const stripped = pasted.split('\n').map(line => {
    if (!line.includes(',')) return line;
    const trimmed = line.trim();
    if (!trimmed || grammar.match(trimmed).succeeded()) return line;
    // Line doesn't parse — try stripping from each comma position (right to left)
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] !== ',') continue;
      const candidate = line.slice(0, i);
      if (candidate.trim() && grammar.match(candidate.trim()).succeeded()) return candidate;
    }
    return line;
  }).join('\n');

  if (stripped !== pasted) {
    e.preventDefault();
    const start = textarea.selectionStart;
    textarea.setRangeText(stripped, start, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input'));
  }
});

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

let stopTypingDemo;

function showIntro() {
  introDialog.classList.remove('is-entering');
  requestAnimationFrame(() => {
    introDialog.showModal();
    introDialog.classList.add('is-entering');
    lockBody(true);
    stopTypingDemo = initTypingDemo(typingDemo);
  });
}

heading.addEventListener('click', showIntro);

helpBtn.addEventListener('click', () => { helpDialog.showModal(); lockBody(true); });
helpDialog.addEventListener('close', () => { lockBody(false); });
introDialog.addEventListener('close', () => {
  localStorage.setItem('sumthing_intro', '1');
  lockBody(false);
  introDialog.classList.remove('is-entering');
  if (stopTypingDemo) stopTypingDemo();
});

const eyes = document.querySelectorAll('.m-eye');
const pupils = document.querySelectorAll('.m-eye-pupil');

if (eyes.length && pupils.length) {
  function blinkRandomly() {
    eyes.forEach(eye => eye.classList.add('is-blinking'));
    setTimeout(() => {
      eyes.forEach(eye => eye.classList.remove('is-blinking'));
      setTimeout(blinkRandomly, Math.random() * 4000 + 2000);
    }, 150);
  }

  setTimeout(blinkRandomly, 2000);

  const MAX_RADIUS = 8;
  let pupilRafPending = false;
  let pendingMoveX = 0, pendingMoveY = 0;

  document.addEventListener('mousemove', (e) => {
    let xRatio = ((e.clientX / window.innerWidth) - 0.5) * 2;
    let yRatio = ((e.clientY / window.innerHeight) - 0.5) * 2;
    const distance = Math.sqrt(xRatio * xRatio + yRatio * yRatio);

    if (distance > 1) {
      xRatio /= distance;
      yRatio /= distance;
    }

    pendingMoveX = xRatio * MAX_RADIUS;
    pendingMoveY = yRatio * MAX_RADIUS;

    if (pupilRafPending) return;
    pupilRafPending = true;
    requestAnimationFrame(() => {
      pupils.forEach(pupil => pupil.style.transform = `translate(${pendingMoveX}px, ${pendingMoveY}px)`);
      pupilRafPending = false;
    });
  });
}

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

  if (!localStorage.getItem('sumthing_intro')) {
    showIntro();
  }

  const success = await fetchRates();
  if (success) evalAndRender();
}

init();
