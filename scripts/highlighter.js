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
  result = result.replace(/^(\w+)(\s*[=:])/, '<span class="hl-variable">$1</span>$2');

  // Currency amounts
  result = result.replace(/([$€£])(\d+(?:\.\d+)?[Kk]?)/g, '<span class="hl-number">$1$2</span>');

  // Percentages
  result = result.replace(/(\d+(?:\.\d+)?%)/g, '<span class="hl-number">$1</span>');

  // Fraction quantities (e.g. 1/8inch, 1/8", 3/4')
  result = result.replace(/(\d+\/\d+(?:kmph|km\/hr|km\/h|kph|kmh|k\/hr|mph|m\/s|mps|ft\/s|fps|knots?|inches|inch|feet|foot|ft|yards?|yd|miles?|mi|kg|mg|km|cm|mm|ml|kb|mb|gb|weeks?|hours?|days?|mins?|secs?|hrs?|g|l|m|b|&quot;|'))\b/gi, '<span class="hl-number">$1</span>');

  // Numbers with units (avoid double-highlighting currency)
  result = result.replace(/(?<!["$€£\d])(\d+(?:\.\d+)?(?:kmph|km\/hr|km\/h|kph|kmh|k\/hr|mph|m\/s|mps|ft\/s|fps|knots?|inches|inch|feet|foot|ft|yards?|yd|miles?|mi|kg|mg|km|cm|mm|ml|kb|mb|gb|weeks?|hours?|days?|mins?|secs?|hrs?|g|l|m|b))\b/gi, '<span class="hl-number">$1</span>');

  // Numbers with " or ' symbol units (e.g. 5", 3')
  result = result.replace(/(?<!<span[^>]*>)(\d+(?:\.\d+)?)((&quot;)|')/g, '<span class="hl-number">$1$2</span>');

  // Plain numbers not already highlighted
  result = result.replace(/(?<!<span[^>]*>)(?<![.$€£\d])(\d+(?:\.\d+)?[Kk]?)(?![^<]*<\/span>)/g, '<span class="hl-number">$1</span>');

  // Keywords
  result = result.replace(/\b(sum|total|now|today|prev|previous|avg|average|weeks?|months?|days?|hours?|minutes?|seconds?)\b/gi, '<span class="hl-keyword">$1</span>');

  // Word operators
  result = result.replace(/\b(plus|minus|times|divided by|divided|and|with|without|at|off|on|of|pa|from now|from|in|as a percentage|as a percent|as|percentage|percent)\b/gi, '<span class="hl-operator">$1</span>');

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
