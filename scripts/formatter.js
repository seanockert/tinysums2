// Formatter — converts Result objects to display strings
import { UNIT_DISPLAY } from './tables.js';
import { currencyPrefix, ZERO_DECIMAL_CODES } from './currency.js';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeCurrencyFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Below 0.01 two decimals would round to "0", so switch to significant digits
const smallFormatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 3,
});

function formatNumber(value) {
  if (value !== 0 && Math.abs(value) < 0.01) return smallFormatter.format(value);
  return numberFormatter.format(value);
}

export function formatResult(res) {
  if (!res || res.value === undefined) return '';
  if (res.timezone) {
    return formatTimeInZone(new Date(res.value), res.timezone.iana, res.timezone.label);
  }
  if (res.isDate) return formatDate(new Date(res.value));

  // Divide by zero and the like
  if (!Number.isFinite(res.value)) return '';

  if (res.isPercent) return formatNumber(res.value * 100) + '%';

  // The code decides the prefix, not whatever got carried along
  if (res.currencyCode) {
    const format = ZERO_DECIMAL_CODES.has(res.currencyCode)
      ? wholeCurrencyFormatter.format(res.value)
      : currencyFormatter.format(res.value);
    const prefix = currencyPrefix(res.currencyCode);
    return prefix ? prefix + format : format + ' ' + res.currencyCode.toUpperCase();
  }
  if (res.prefix) return res.prefix + currencyFormatter.format(res.value);

  // Percentage result (from percentage queries)
  if (res.unit === '%') return formatNumber(res.value) + '%';

  // Quantity with units
  if (res.unit) {
    const display = UNIT_DISPLAY[res.unit] || res.unit;
    const sep = (display === '"' || display === "'") ? '' : ' ';
    return formatNumber(res.value) + sep + display;
  }

  return formatNumber(res.value);
}

const tzFormatCache = new Map();

function formatTimeInZone(date, ianaZone, label) {
  let fmt = tzFormatCache.get(ianaZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    tzFormatCache.set(ianaZone, fmt);
  }
  return fmt.format(date).toLowerCase() + ' ' + label;
}

function formatDate(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'pm' : 'am';
  const hours = date.getHours() % 12 || 12;
  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
}
