// TinySums syntax highlighter — regex-based tokenizer

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  // Check for variable definition — highlight name
  let result = escapeHtml(line);

  // Variable name before = or :
  result = result.replace(/^([a-zA-Z_]\w*)(\s*[=:])/, '<span class="hl-variable">$1</span>$2');

  // Currency amounts
  result = result.replace(/([$€£])(\d+(?:,\d+)*(?:\.\d+)?[Kk]?)/g, '<span class="hl-number">$1$2</span>');

  // Percentages
  result = result.replace(/(\d+(?:,\d+)*(?:\.\d+)?%)/g, '<span class="hl-number">$1</span>');

  // Fraction quantities (e.g. 1/8inch, 1/8", 3/4')
  result = result.replace(/(\d+\/\d+(?:kmph|km\/hr|km\/h|kph|kmh|k\/hr|mph|m\/s|mps|ft\/s|fps|knots?|tablespoons?|tbsp|teaspoons?|tsp|cups?|fluid oz|fl oz|floz|gallons?|gal|quarts?|qt|pints?|pt|inches|inch|feet|foot|ft|yards?|yd|miles?|mi|kg|mg|km|cm|mm|ml|kb|mb|gb|weeks?|hours?|days?|mins?|secs?|hrs?|g|l|m|b|&quot;|'))\b/gi, '<span class="hl-number">$1</span>');

  // Numbers with units (avoid double-highlighting currency)
  result = result.replace(/(?<!["$€£\d])(\d+(?:,\d+)*(?:\.\d+)?(?:kmph|km\/hr|km\/h|kph|kmh|k\/hr|mph|m\/s|mps|ft\/s|fps|knots?|tablespoons?|tbsp|teaspoons?|tsp|cups?|fluid oz|fl oz|floz|gallons?|gal|quarts?|qt|pints?|pt|inches|inch|feet|foot|ft|yards?|yd|miles?|mi|kg|mg|km|cm|mm|ml|kb|mb|gb|weeks?|hours?|days?|mins?|secs?|hrs?|celsius|fahrenheit|kelvin|g|l|m|b))\b/gi, '<span class="hl-number">$1</span>');

  // Numbers with " or ' symbol units (e.g. 5", 3')
  result = result.replace(/(?<!<span[^>]*>)(\d+(?:,\d+)*(?:\.\d+)?)((&quot;)|')/g, '<span class="hl-number">$1$2</span>');

  // Time literals (3:30pm, 8am, 15:00) — before plain numbers to avoid partial matches
  result = result.replace(/\b(\d{1,2}:\d{2}(?:am|pm)?)\b/gi, '<span class="hl-number">$1</span>');
  result = result.replace(/\b(\d{1,2}(?:am|pm))\b/gi, '<span class="hl-number">$1</span>');

  // Plain numbers not already highlighted
  result = result.replace(/(?<!<span[^>]*>)(?<![.$€£\d])(\d+(?:,\d+)*(?:\.\d+)?[Kk]?)(?![^<]*<\/span>)/g, '<span class="hl-number">$1</span>');

  // Numbers with currency codes (e.g. 100 USD, 50K AUD)
  result = result.replace(/(?<!<span[^>]*>)(\d+(?:,\d+)*(?:\.\d+)?[Kk]?\s*)(USD|EUR|GBP|AUD|CAD|NZD|JPY|CHF|CNY|INR|SGD|HKD|KRW|SEK|NOK|DKK|BRL|ZAR|MXN|THB)\b/gi, '<span class="hl-number">$1$2</span>');

  // Timezone abbreviations
  result = result.replace(/\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AEST|AEDT|ACST|AWST|BST|CET|CEST|EET|EEST|JST|KST|IST|NZST|NZDT|HST|AKST|AKDT)\b/g, '<span class="hl-keyword">$1</span>');

  // Currency codes (standalone, e.g. as conversion target: "in EUR")
  result = result.replace(/(?<![<\w])\b(USD|EUR|GBP|AUD|CAD|NZD|JPY|CHF|CNY|INR|SGD|HKD|KRW|SEK|NOK|DKK|BRL|ZAR|MXN|THB)\b(?![^<]*<\/span>)/gi, '<span class="hl-keyword">$1</span>');

  // Keywords
  result = result.replace(/\b(sum|total|now|today|prev|previous|avg|average|weeks?|months?|days?|hours?|minutes?|seconds?|celsius|fahrenheit|kelvin|tablespoons?|teaspoons?|cups?|gallons?|quarts?|pints?|grams?)\b/gi, '<span class="hl-keyword">$1</span>');

  // Word operators
  result = result.replace(/\b(plus|minus|times|divided by|divided|and|with|without|at|off|on|of|pa|from now|from|into|in|to|for|as a percentage|as a percent|as|percentage|percent|compounding|monthly|quarterly|annually|yearly|daily|weekly|what|x)\b/gi, '<span class="hl-operator">$1</span>');

  // Variable references — highlight defined variable names not already inside spans
  if (definedVars && definedVars.size > 0) {
    const varNames = [...definedVars].sort((a, b) => b.length - a.length);
    const escaped = varNames.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const varPattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
    result = result.replace(varPattern, (match, name, offset, original) => {
      const before = original.substring(0, offset);
      const opens = (before.match(/<span/g) || []).length;
      const closes = (before.match(/<\/span>/g) || []).length;
      if (opens > closes) return match;
      return `<span class="hl-variable">${name}</span>`;
    });
  }

  return result + '\n';
}

export function highlightAll(input) {
  const definedVars = new Set();
  return input.split('\n').map(line => {
    // Detect variable definitions before highlighting
    const assignMatch = line.match(/^(\w+)\s*[=:]/);
    if (assignMatch) definedVars.add(assignMatch[1]);
    const isMatch = line.match(/^(\w+)\s+is\s/);
    if (isMatch) definedVars.add(isMatch[1]);
    return highlightLine(line, definedVars);
  }).join('');
}
