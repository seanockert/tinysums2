export const CURRENCY_CODES = new Set([
  'usd', 'eur', 'gbp', 'aud', 'cad', 'nzd', 'jpy', 'chf',
  'cny', 'inr', 'sgd', 'hkd', 'krw', 'sek', 'nok', 'dkk',
  'brl', 'zar', 'mxn', 'thb',
]);

// Shared symbols: yours wins if it's in the family, otherwise the first
const SYMBOL_FAMILIES = {
  '$': ['usd', 'aud', 'cad', 'nzd', 'sgd', 'hkd', 'mxn', 'brl'],
  '¥': ['jpy', 'cny'],
};

// Symbols naming exactly one currency
const SYMBOL_TO_CODE = {
  '€': 'eur', '£': 'gbp', '₹': 'inr', '₩': 'krw', '฿': 'thb',
  'AU$': 'aud', 'A$': 'aud', 'US$': 'usd', 'NZ$': 'nzd',
  'CA$': 'cad', 'C$': 'cad', 'HK$': 'hkd', 'S$': 'sgd',
  'MX$': 'mxn', 'R$': 'brl', 'CN¥': 'cny',
};

// Longest first: "AU$" before "A$", bare family symbols last
export const CURRENCY_SYMBOLS = [
  ...Object.keys(SYMBOL_TO_CODE).sort((a, b) => b.length - a.length),
  ...Object.keys(SYMBOL_FAMILIES),
];

// Only the home currency gets a bare symbol
const CODE_TO_PREFIX = {
  usd: 'US$', aud: 'A$', cad: 'C$', nzd: 'NZ$', sgd: 'S$', hkd: 'HK$',
  mxn: 'MX$', brl: 'R$', jpy: '¥', cny: 'CN¥',
  eur: '€', gbp: '£', inr: '₹', krw: '₩', thb: '฿',
};

// Quoted without cents
export const ZERO_DECIMAL_CODES = new Set(['jpy', 'krw']);

const REGION_TO_CURRENCY = {
  AU: 'aud', US: 'usd', GB: 'gbp', NZ: 'nzd', CA: 'cad',
  JP: 'jpy', CH: 'chf', CN: 'cny', IN: 'inr', SG: 'sgd',
  HK: 'hkd', KR: 'krw', SE: 'sek', NO: 'nok', DK: 'dkk',
  BR: 'brl', ZA: 'zar', MX: 'mxn', TH: 'thb',
  // Eurozone
  DE: 'eur', FR: 'eur', IT: 'eur', ES: 'eur', NL: 'eur',
  BE: 'eur', AT: 'eur', IE: 'eur', PT: 'eur', FI: 'eur',
  GR: 'eur', LU: 'eur', SI: 'eur', SK: 'eur', EE: 'eur',
  LV: 'eur', LT: 'eur', CY: 'eur', MT: 'eur', HR: 'eur',
};

const CURRENCY_KEY = 'sumthing_currency';
const RATES_KEY = 'sumthing_rates';
const RATES_TTL = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 5000;

const RATE_URLS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
  'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
];

let defaultCode = null;
let ratesCache = null;

export function getDefaultCurrencyCode() {
  if (defaultCode) return defaultCode;
  defaultCode = storedCode()
    || REGION_TO_CURRENCY[timezoneRegion()]
    || REGION_TO_CURRENCY[languageRegion()]
    || 'usd';
  return defaultCode;
}

// Override: localStorage.sumthing_currency = 'aud'
function storedCode() {
  try {
    const code = localStorage.getItem(CURRENCY_KEY)?.trim().toLowerCase();
    return CURRENCY_CODES.has(code) ? code : null;
  } catch { return null; }
}

// Brave farbles navigator.language (en-AU reads as en-GB), so the OS timezone
// leads. Asking each region for its zones avoids a second table.
function timezoneRegion() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return null;
    for (const region of Object.keys(REGION_TO_CURRENCY)) {
      const locale = new Intl.Locale(`und-${region}`);
      const zones = locale.getTimeZones?.() ?? locale.timeZones;
      if (zones?.includes(zone)) return region;
    }
  } catch {}
  return null;
}

function languageRegion() {
  try {
    return navigator.language?.split('-')[1]?.toUpperCase() || null;
  } catch { return null; }
}

export function resolveSymbol(symbol) {
  const key = symbol.toUpperCase();
  if (SYMBOL_TO_CODE[key]) return SYMBOL_TO_CODE[key];
  const family = SYMBOL_FAMILIES[key];
  if (!family) return getDefaultCurrencyCode();
  const home = getDefaultCurrencyCode();
  return family.includes(home) ? home : family[0];
}

// Non-home currencies keep their qualifier, so US$ can't read as local
export function currencyPrefix(code) {
  if (code === getDefaultCurrencyCode()) {
    for (const [symbol, family] of Object.entries(SYMBOL_FAMILIES)) {
      if (family.includes(code)) return symbol;
    }
  }
  return CODE_TO_PREFIX[code] || '';
}

// Keep only the codes we support, so the stored copy stays small
function pickSupported(rates) {
  const picked = { usd: 1 };
  for (const code of CURRENCY_CODES) {
    if (rates[code] != null) picked[code] = rates[code];
  }
  return picked;
}

function readStoredRates() {
  try {
    const stored = JSON.parse(localStorage.getItem(RATES_KEY));
    if (stored?.rates && typeof stored.at === 'number') return stored;
  } catch {}
  return null;
}

export async function fetchRates() {
  // Use yesterday's rates immediately, and skip the network if they're still fresh
  const stored = readStoredRates();
  if (stored) {
    ratesCache = stored.rates;
    if (Date.now() - stored.at < RATES_TTL) return true;
  }

  for (const url of RATE_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) continue;
      const data = await res.json();
      ratesCache = pickSupported(data.usd);
      try {
        localStorage.setItem(RATES_KEY, JSON.stringify({ at: Date.now(), rates: ratesCache }));
      } catch {}
      return true;
    } catch { continue; }
  }

  // Offline with an expired copy is still better than no rates at all
  return stored !== null;
}

export function convertCurrency(amount, fromCode, toCode) {
  if (!ratesCache) return null;
  const fromRate = ratesCache[fromCode];
  const toRate = ratesCache[toCode];
  if (fromRate == null || toRate == null) return null;
  return amount / fromRate * toRate;
}
