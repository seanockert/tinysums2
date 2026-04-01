// TinySums formatter — converts Result objects to display strings

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

  // Date/time result (value is a timestamp)
  if (res.value > 1e12 && !res.prefix && !res.unit) {
    return formatDate(new Date(res.value));
  }

  const rounded = Math.round(res.value * 100) / 100;

  // Currency
  if (res.prefix) {
    return res.prefix + currencyFormatter.format(rounded);
  }

  // Quantity with units
  if (res.unit) {
    return numberFormatter.format(rounded) + res.unit;
  }

  // Plain number
  return numberFormatter.format(rounded);
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

