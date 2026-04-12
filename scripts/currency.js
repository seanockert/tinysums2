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

let defaultCode = null;
let ratesCache = null;

export function getDefaultCurrencyCode() {
  if (defaultCode) return defaultCode;
  try {
    const locale = navigator.language || 'en-US';
    const region = locale.split('-')[1]?.toUpperCase();
    defaultCode = (region && REGION_TO_CURRENCY[region]) || 'usd';
  } catch {
    defaultCode = 'usd';
  }
  return defaultCode;
}

export async function fetchRates() {
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      ratesCache = data.usd;
      ratesCache.usd = 1;
      return true;
    } catch { continue; }
  }
  return false;
}

export function convertCurrency(amount, fromCode, toCode) {
  if (!ratesCache) return null;
  const fromRate = ratesCache[fromCode];
  const toRate = ratesCache[toCode];
  if (fromRate == null || toRate == null) return null;
  return amount / fromRate * toRate;
}

export function ratesReady() {
  return ratesCache !== null;
}
