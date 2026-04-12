// Formatter — converts Result objects to display strings
const DISPLAY_UNITS = { kph: 'km/h', mps: 'm/s', fps: 'ft/s' };
const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatResult(res) {
  if (!res || res.value === undefined) return '';

  // Timezone conversion result
  if (res.timezone) {
    return formatTimeInZone(new Date(res.value), res.timezone.iana, res.timezone.label);
  }

  // Date/time result (value is a timestamp)
  if (res.value > 1e12 && !res.prefix && !res.unit) {
    return formatDate(new Date(res.value));
  }

  // Bare percentage
  if (res.isPercent) {
    const pct = Math.round(res.value * 10000) / 100;
    return numberFormatter.format(pct) + '%';
  }

  const rounded = Math.round(res.value * 100) / 100;

  // Currency
  if (res.currencyCode) {
    if (res.prefix) {
      return res.prefix + currencyFormatter.format(rounded);
    }
    return currencyFormatter.format(rounded) + ' ' + res.currencyCode.toUpperCase();
  }
  if (res.prefix) {
    return res.prefix + currencyFormatter.format(rounded);
  }

  // Percentage result (from percentage queries)
  if (res.unit === '%') {
    return numberFormatter.format(rounded) + '%';
  }

  // Temperature
  if (res.unitGroup === 'temperature') {
    const symbols = { c: '\u00b0C', f: '\u00b0F', k: 'K' };
    return numberFormatter.format(rounded) + ' ' + (symbols[res.unit] || res.unit);
  }

  // Quantity with units
  if (res.unit) {
    const display = DISPLAY_UNITS[res.unit] || res.unit;
    const sep = (display === '"' || display === "'") ? '' : ' ';
    return numberFormatter.format(rounded) + sep + display;
  }

  // Plain number
  return numberFormatter.format(rounded);
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
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
}

