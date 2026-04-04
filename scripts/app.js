// TinySums app — UI glue: textarea, results, localStorage, copy

import { evaluate } from './evaluator.js';
import { formatResult } from './formatter.js';
import { highlightAll } from './highlighter.js';
import { fetchRates } from './currency.js';

const STORAGE_KEY = 'tinysums_v2';
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
// Core update loop
// ============================================================

// Instant visual feedback — batched to one update per frame
function syncVisuals() {
  if (state.rafPending) return;
  state.rafPending = true;
  requestAnimationFrame(() => {
    highlightInner.innerHTML = highlightAll(textarea.value);
    autoResize();
    state.rafPending = false;
  });
}

// Expensive work — parsing + evaluation, debounced
function evalAndSave() {
  const input = textarea.value;
  const results = evaluate(input);
  renderOutput(results);
  updateMobilePadding();
  localStorage.setItem(STORAGE_KEY, input);
}

// Set textarea padding-right to exactly the amount needed so no input text
// is hidden behind a result line. Only applies on mobile.
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
        // Reuse existing button
        if (btn.textContent !== formatted) {
          btn.textContent = formatted;
          btn.onclick = () => copyToClipboard(formatted);
        }
      } else {
        // Create new button
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

  // Remove excess rows
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
// Clipboard
// ============================================================

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast();
  } catch (e) {
    // Fallback for older browsers
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
  // Highlighting + resize: immediate so text is never invisible
  syncVisuals();
  // Parsing + results: debounced since it's heavier
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(evalAndSave, DEBOUNCE_MS);
});

// Sync scroll between textarea and highlight layer
textarea.addEventListener('scroll', () => {
  if (state.scrollRafPending) return;
  state.scrollRafPending = true;
  requestAnimationFrame(() => {
    if (state.isMobile) {
      // overflow:visible on mobile means scrollLeft has no effect —
      // translate the inner wrapper instead
      highlightInner.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    } else {
      highlightLayer.scrollTop = textarea.scrollTop;
      highlightLayer.scrollLeft = textarea.scrollLeft;
    }
    state.scrollRafPending = false;
  });
});

// Highlight corresponding output line on hover

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

// ============================================================
// Initialize
// ============================================================

async function init() {
  initTheme();
  const saved = localStorage.getItem(STORAGE_KEY);
  textarea.value = saved || DEFAULT_INPUT;
  syncVisuals();
  cacheTextareaMetrics();
  evalAndSave();
  window.addEventListener('resize', () => {
    state.isMobile = window.innerWidth <= MOBILE_BP;
    if (!state.isMobile) highlightInner.style.transform = '';
    cacheTextareaMetrics();
    updateMobilePadding();
  });
  textarea.focus();

  // Fetch currency rates in background, re-evaluate when ready
  const success = await fetchRates();
  if (success) evalAndSave();
}

init();
