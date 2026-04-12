function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Shared unit list (order matters: longer alternatives first to avoid partial matches)
const UNITS = 'kmph|km\\/hr|km\\/h|kph|kmh|k\\/hr|mph|m\\/s|mps|ft\\/s|fps|knots?|tablespoons?|tbsp|teaspoons?|tsp|cups?|fluid oz|fl oz|floz|gallons?|gal|quarts?|qt|pints?|pt|inches|inch|feet|foot|ft|yards?|yd|miles?|mi|kg|mg|km|cm|mm|ml|kb|mb|gb|weeks?|hours?|days?|mins?|secs?|hrs?|celsius|fahrenheit|kelvin|grams?|g|l|m|b|f|c';

const RE_FRAC_UNIT = new RegExp(`(\\d+\\/\\d+)(${UNITS})\\b`, 'gi');
const RE_FRAC_SYMBOL = /(\d+\/\d+)(&quot;|')/g;
const RE_NUM_UNIT = new RegExp(`(?<!["$€£\\d])(\\d+(?:,\\d+)*(?:\\.\\d+)?)(${UNITS})\\b`, 'gi');
const RE_NUM_SYMBOL = /(?<!<span[^>]*>)(\d+(?:,\d+)*(?:\.\d+)?)((&quot;)|')/g;
const RE_TIME_COLON = /\b(\d{1,2}:\d{2}(?:am|pm)?)\b/gi;
const RE_TIME_SUFFIX = /\b(\d{1,2}(?:am|pm))\b/gi;
const RE_PLAIN_NUM = /(?<!<span[^>]*>)(?<![.$€£\d])(\d+(?:,\d+)*(?:\.\d+)?[Kk]?)(?![^<]*<\/span>)/g;
const RE_NUM_CURRENCY = /(?<!<span[^>]*>)(\d+(?:,\d+)*(?:\.\d+)?[Kk]?\s*)(USD|EUR|GBP|AUD|CAD|NZD|JPY|CHF|CNY|INR|SGD|HKD|KRW|SEK|NOK|DKK|BRL|ZAR|MXN|THB)\b/gi;
const RE_TIMEZONE = /\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AEST|AEDT|ACST|AWST|BST|CET|CEST|EET|EEST|JST|KST|IST|NZST|NZDT|HST|AKST|AKDT)\b/g;
const RE_CURRENCY_STANDALONE = /(?<![<\w])\b(USD|EUR|GBP|AUD|CAD|NZD|JPY|CHF|CNY|INR|SGD|HKD|KRW|SEK|NOK|DKK|BRL|ZAR|MXN|THB)\b(?![^<]*<\/span>)/gi;
const RE_KEYWORD = new RegExp(`\\b(sum|total|now|today|prev|previous|avg|average|months?|minutes?|seconds?|percentage|percent|pa|${UNITS})\\b`, 'gi');
const RE_OPERATOR = /\b(plus|minus|times|divided by|divided|and|with|without|at|off|on|of|from now|from|into|in|to|for|as a percentage|as a percent|as|how many|how|compounding|monthly|quarterly|annually|yearly|daily|weekly|what|x)\b/gi;

function isInsideSpan(original, offset) {
  const before = original.substring(0, offset);
  const opens = (before.match(/<span/g) || []).length;
  const closes = (before.match(/<\/span>/g) || []).length;
  return opens > closes;
}

export function highlightLine(line, definedVars) {
  if (!line) return '\n';

  // Check for comment first — highlight entire line
  if (/^\s*\/\//.test(line)) {
    return `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
  }
  if (/^\s*"/.test(line)) {
    return `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
  }

  let result = escapeHtml(line);

  // Variable name before = or :
  result = result.replace(/^([a-zA-Z_]\w*)(\s*[=:])/, '<span class="hl-variable">$1</span>$2');

  // Currency amounts
  result = result.replace(/([$€£])(\d+(?:,\d+)*(?:\.\d+)?[Kk]?)/g, '<span class="hl-number">$1$2</span>');

  // Percentages
  result = result.replace(/(\d+(?:,\d+)*(?:\.\d+)?%)/g, '<span class="hl-number">$1</span>');

  // Fraction quantities with units (e.g. 1/8inch, 3/4cup)
  RE_FRAC_UNIT.lastIndex = 0;
  result = result.replace(RE_FRAC_UNIT, '<span class="hl-number">$1</span><span class="hl-keyword">$2</span>');

  // Fraction quantities with symbol units (e.g. 1/8", 3/4')
  result = result.replace(RE_FRAC_SYMBOL, '<span class="hl-number">$1$2</span>');

  // Numbers with units
  RE_NUM_UNIT.lastIndex = 0;
  result = result.replace(RE_NUM_UNIT, '<span class="hl-number">$1</span><span class="hl-keyword">$2</span>');

  // Numbers with " or ' symbol units (e.g. 5", 3')
  result = result.replace(RE_NUM_SYMBOL, '<span class="hl-number">$1$2</span>');

  // Time literals (3:30pm, 8am, 15:00) — before plain numbers to avoid partial matches
  RE_TIME_COLON.lastIndex = 0;
  result = result.replace(RE_TIME_COLON, '<span class="hl-number">$1</span>');
  RE_TIME_SUFFIX.lastIndex = 0;
  result = result.replace(RE_TIME_SUFFIX, '<span class="hl-number">$1</span>');

  // Plain numbers not already highlighted
  result = result.replace(RE_PLAIN_NUM, '<span class="hl-number">$1</span>');

  // Numbers with currency codes (e.g. 100 USD, 50K AUD)
  RE_NUM_CURRENCY.lastIndex = 0;
  result = result.replace(RE_NUM_CURRENCY, '<span class="hl-number">$1$2</span>');

  // Timezone abbreviations
  result = result.replace(RE_TIMEZONE, '<span class="hl-keyword">$1</span>');

  // Currency codes (standalone, e.g. as conversion target: "in EUR")
  RE_CURRENCY_STANDALONE.lastIndex = 0;
  result = result.replace(RE_CURRENCY_STANDALONE, '<span class="hl-keyword">$1</span>');

  // Keywords — skip user-defined variables and already-highlighted spans
  RE_KEYWORD.lastIndex = 0;
  result = result.replace(RE_KEYWORD, (match, word, offset, original) => {
    if (definedVars && definedVars.has(word)) return match;
    if (isInsideSpan(original, offset)) return match;
    return `<span class="hl-keyword">${word}</span>`;
  });

  // Word operators
  RE_OPERATOR.lastIndex = 0;
  result = result.replace(RE_OPERATOR, '<span class="hl-operator">$1</span>');

  // Variable references — highlight defined variable names not already inside spans
  if (definedVars && definedVars._cachedPattern) {
    const varPattern = definedVars._cachedPattern;
    varPattern.lastIndex = 0;
    result = result.replace(varPattern, (match, name, offset, original) => {
      if (isInsideSpan(original, offset)) return match;
      return `<span class="hl-variable">${name}</span>`;
    });
  }

  return result + '\n';
}

export function highlightAll(input) {
  const definedVars = new Set();
  definedVars._cachedPattern = null;
  let lastSize = 0;
  return input.split('\n').map(line => {
    // Detect variable definitions before highlighting
    const assignMatch = line.match(/^(\w+)\s*[=:]/);
    if (assignMatch) definedVars.add(assignMatch[1]);
    const isMatch = line.match(/^(\w+)\s+is\s/);
    if (isMatch) definedVars.add(isMatch[1]);
    // Only rebuild regex when new variables are added
    if (definedVars.size > 0 && definedVars.size !== lastSize) {
      const varNames = [...definedVars].sort((a, b) => b.length - a.length);
      const escaped = varNames.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      definedVars._cachedPattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
      lastSize = definedVars.size;
    }
    return highlightLine(line, definedVars);
  }).join('');
}
