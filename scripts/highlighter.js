import { UNIT_SPELLINGS, TZ_LABELS } from './tables.js';
import { CURRENCY_CODES, CURRENCY_SYMBOLS } from './currency.js';

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Generated from the same tables the grammar uses, longest alternative first
const UNITS = UNIT_SPELLINGS.map(escapeRe).join('|');
const CODES = [...CURRENCY_CODES].join('|');
const ZONES = TZ_LABELS.join('|');

// Same symbols the grammar uses; the bare chars feed the lookbehinds below
const SYMBOLS = CURRENCY_SYMBOLS.map(escapeRe).join('|');
const SYMBOL_CHARS = [...new Set(CURRENCY_SYMBOLS.join('').replace(/[a-z]/gi, ''))].join('');

// \w guard keeps "AU$" out of mid-word
const RE_CURRENCY_AMOUNT = new RegExp(
  `(?<!\\w)(${SYMBOLS})(\\d+(?:,\\d+)*(?:\\.\\d+)?[Kk]?)`, 'gi');
const RE_FRAC_UNIT = new RegExp(`(\\d+\\/\\d+)(${UNITS})\\b`, 'gi');
const RE_FRAC_SYMBOL = /(\d+\/\d+)(&quot;|')/g;
const RE_NUM_UNIT = new RegExp(`(?<!["${SYMBOL_CHARS}\\d])(\\d+(?:,\\d+)*(?:\\.\\d+)?)(${UNITS})\\b`, 'gi');
const RE_NUM_SYMBOL = /(?<!<span[^>]*>)(\d+(?:,\d+)*(?:\.\d+)?)((&quot;)|')/g;
const RE_TIME_COLON = /\b(\d{1,2}:\d{2}(?:am|pm)?)\b/gi;
const RE_TIME_SUFFIX = /\b(\d{1,2}(?:am|pm))\b/gi;
const RE_PLAIN_NUM = new RegExp(
  `(?<!<span[^>]*>)(?<![.${SYMBOL_CHARS}\\d])(\\d+(?:,\\d+)*(?:\\.\\d+)?[Kk]?)(?![^<]*<\\/span>)`, 'g');
const RE_NUM_CURRENCY = new RegExp(`(?<!<span[^>]*>)(\\d+(?:,\\d+)*(?:\\.\\d+)?[Kk]?\\s*)(${CODES})\\b`, 'gi');
const RE_TIMEZONE = new RegExp(`\\b(${ZONES})\\b`, 'g');
const RE_CURRENCY_STANDALONE = new RegExp(`(?<![<\\w])\\b(${CODES})\\b(?![^<]*<\\/span>)`, 'gi');
const RE_KEYWORD = new RegExp(`\\b(sum|total|now|today|prev|previous|avg|average|minimum|maximum|lowest|highest|count|percentage|percent|pa|${UNITS})\\b`, 'gi');
const RE_OPERATOR = /\b(plus|minus|times|divided by|divided|and|with|without|at|off|on|of|from now|from|ago|into|in|to|for|as a percentage|as a percent|as|how many|how|compounding|monthly|quarterly|annually|yearly|daily|weekly|what|x)\b/gi;

// Cheaper than counting every tag: find the nearest tag boundary before offset
function isInsideSpan(original, offset) {
  return original.lastIndexOf('<span', offset) > original.lastIndexOf('</span>', offset);
}

export function highlightLine(line, definedVars) {
  if (!line) return '\n';

  // Comments and quoted notes colour the whole line
  if (/^\s*(\/\/|")/.test(line)) {
    return `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
  }

  let result = escapeHtml(line);

  // Variable name before = or :
  result = result.replace(/^([a-zA-Z_]\w*)(\s*[=:])/, '<span class="hl-variable">$1</span>$2');

  // Currency amounts ($100, AU$100, ¥1000)
  result = result.replace(RE_CURRENCY_AMOUNT, '<span class="hl-number">$1$2</span>');

  // Percentages
  result = result.replace(/(\d+(?:,\d+)*(?:\.\d+)?%)/g, '<span class="hl-number">$1</span>');

  // Fraction quantities, with named units (1/8inch) then symbol units (1/8")
  result = result.replace(RE_FRAC_UNIT, '<span class="hl-number">$1</span><span class="hl-keyword">$2</span>');
  result = result.replace(RE_FRAC_SYMBOL, '<span class="hl-number">$1$2</span>');

  // Numbers with units, then with " or ' symbol units (5", 3')
  result = result.replace(RE_NUM_UNIT, '<span class="hl-number">$1</span><span class="hl-keyword">$2</span>');
  result = result.replace(RE_NUM_SYMBOL, '<span class="hl-number">$1$2</span>');

  // Time literals (3:30pm, 8am, 15:00) — before plain numbers to avoid partial matches
  result = result.replace(RE_TIME_COLON, '<span class="hl-number">$1</span>');
  result = result.replace(RE_TIME_SUFFIX, '<span class="hl-number">$1</span>');

  // Plain numbers not already highlighted
  result = result.replace(RE_PLAIN_NUM, '<span class="hl-number">$1</span>');

  // Numbers with currency codes (100 USD, 50K AUD)
  result = result.replace(RE_NUM_CURRENCY, '<span class="hl-number">$1$2</span>');

  // Timezones, then standalone currency codes ("in EUR")
  result = result.replace(RE_TIMEZONE, '<span class="hl-keyword">$1</span>');
  result = result.replace(RE_CURRENCY_STANDALONE, '<span class="hl-keyword">$1</span>');

  // Keywords — skip user-defined variables and already-highlighted spans
  result = result.replace(RE_KEYWORD, (match, word, offset, original) => {
    if (definedVars?.has(word)) return match;
    if (isInsideSpan(original, offset)) return match;
    return `<span class="hl-keyword">${word}</span>`;
  });

  result = result.replace(RE_OPERATOR, '<span class="hl-operator">$1</span>');

  // Variable references not already inside a span
  const varPattern = definedVars?.pattern;
  if (varPattern) {
    varPattern.lastIndex = 0;
    result = result.replace(varPattern, (match, name, offset, original) =>
      isInsideSpan(original, offset) ? match : `<span class="hl-variable">${name}</span>`);
  }

  return result + '\n';
}

export function highlightAll(input) {
  const definedVars = new Set();
  definedVars.pattern = null;
  let lastSize = 0;

  return input.split('\n').map(line => {
    // Collect variable definitions as we go, so later lines can reference them
    const assign = line.match(/^(\w+)\s*(?:[=:]|\s+is\s)/);
    if (assign) definedVars.add(assign[1]);
    // Only rebuild the pattern when a new variable appears
    if (definedVars.size !== lastSize) {
      const names = [...definedVars]
        .sort((a, b) => b.length - a.length)
        .map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      definedVars.pattern = new RegExp(`\\b(${names.join('|')})\\b`, 'g');
      lastSize = definedVars.size;
    }
    return highlightLine(line, definedVars);
  }).join('');
}
