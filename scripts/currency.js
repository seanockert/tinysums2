export const CURRENCY_CODES = new Set([
  'usd', 'eur', 'gbp', 'aud', 'cad', 'nzd', 'jpy', 'chf',
  'cny', 'inr', 'sgd', 'hkd', 'krw', 'sek', 'nok', 'dkk',
  'brl', 'zar', 'mxn', 'thb',
]);

export const SYMBOL_TO_CODE = { '$': null, '€': 'eur', '£': 'gbp' };
export const CODE_TO_SYMBOL = { usd: '$', eur: '€', gbp: '£' };

const REGION_TO_CURRENCY = {
  AU: 'aud', US: 'usd', GB: 'gbp', NZ: 'nzd', CA: 'cad',
  JP: 'jpy', CH: 'chf', CN: 'cny', IN: 'inr', SG: 'sgd',
  HK: 'hkd', KR: 'krw', SE: 'sek', NO: 'nok', DK: 'dkk',
  BR: 'brl', ZA: 'zar', MX: 'mxn', TH: 'thb',
  // Eurozone
  DE: 'eur', FR: 'eur', IT: 'eur', ES: 'eur', NL: 'eur',
  BE: 'eur', AT: 'eur', IE: 'eur', PT: 'eur', FI: 'eur',
  GR: 'eur', LU: 'eur',
};

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
  try {
    const region = (navigator.language || 'en-US').split('-')[1]?.toUpperCase();
    defaultCode = (region && REGION_TO_CURRENCY[region]) || 'usd';
  } catch {
    defaultCode = 'usd';
  }
  return defaultCode;
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
