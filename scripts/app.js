// TinySums app — UI glue: textarea, results, localStorage, copy

import { evaluate } from './evaluator.js';
import { formatResult } from './formatter.js';
import { highlightAll } from './highlighter.js';
import { fetchRates } from './currency.js';

const STORAGE_KEY = 'tinysums_v2';
const DEBOUNCE_MS = 300;

const DEFAULT_INPUT = `// Define values to use in calculations
days = 15

// Define some variables
food: $12 * days
transport: $3.50 * days

// Add up all the above
sum

// Use units like kg
20kg plus 1900g

// Quickly calculate percentages
32% off $429

// Convert currencies
100 USD in EUR

// Or compound interest
$4000.22 at 3% pa

// Dates and more
today`;

// ============================================================
// DOM references
// ============================================================

const textarea = document.getElementById('input');
const highlightLayer = document.getElementById('highlight');
const outputContainer = document.getElementById('output');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');

// ============================================================
// State
// ============================================================

let debounceTimer = null;
const HAS_FIELD_SIZING = CSS.supports('field-sizing', 'content');

// ============================================================
// Core update loop
// ============================================================

// Instant visual feedback — runs on every keystroke, no debounce
function syncVisuals() {
  const input = textarea.value;
  highlightLayer.innerHTML = highlightAll(input);
  autoResize();
}

// Expensive work — parsing + evaluation, debounced
function evalAndSave() {
  const input = textarea.value;
  const results = evaluate(input);
  renderOutput(results);
  localStorage.setItem(STORAGE_KEY, input);
}

function renderOutput(results) {
  outputContainer.innerHTML = '';
  for (const res of results) {
    const div = document.createElement('div');
    div.className = 'result-line';
    const formatted = formatResult(res);
    if (formatted) {
      const btn = document.createElement('button');
      btn.className = 'result-value';
      btn.textContent = formatted;
      btn.title = 'Click to copy';
      btn.addEventListener('click', () => copyToClipboard(formatted));
      div.appendChild(btn);
    }
    outputContainer.appendChild(div);
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

let toastTimer = null;

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
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1200);
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
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(evalAndSave, DEBOUNCE_MS);
});

// Sync scroll between textarea and highlight layer
textarea.addEventListener('scroll', () => {
  highlightLayer.scrollTop = textarea.scrollTop;
  highlightLayer.scrollLeft = textarea.scrollLeft;
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  initTheme();
  const saved = localStorage.getItem(STORAGE_KEY);
  textarea.value = saved || DEFAULT_INPUT;
  syncVisuals();
  evalAndSave();
  textarea.focus();

  // Fetch currency rates in background, re-evaluate when ready
  const success = await fetchRates();
  if (success) evalAndSave();
}

init();
