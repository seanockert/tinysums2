// Shared lookup tables — the single source of truth for units and timezones.
// grammar.js generates its unitSuffix/timezone rules from these, highlighter.js
// builds its regexes from them, and evaluator.js does the maths with them.
// Add a unit here and all three pick it up.

// Scale relative to each group's base unit
export const UNIT_GROUPS = {
  mass:   { mg: 0.001, g: 1, oz: 28.349523125, lb: 453.59237, stone: 6350.29318, kg: 1000, t: 1e6 },
  volume: { ml: 1, tsp: 5, tbsp: 15, floz: 29.5735, cup: 236.588, pint: 473.176, quart: 946.353, l: 1000, gallon: 3785.41 },
  length: { mm: 1, cm: 10, m: 1000, km: 1000000, inch: 25.4, ft: 304.8, yd: 914.4, mi: 1609344 },
  area:   { sqm: 1, sqft: 0.09290304, acre: 4046.8564224, ha: 10000, sqkm: 1e6, sqmi: 2589988.110336 },
  data:   { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 },
  time:   { ms: 0.001, sec: 1, min: 60, hr: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 },
  speed:  { kph: 1, mph: 1.60934, mps: 3.6, fps: 1.09728, knot: 1.852 },
};

export const TEMP_CONVERSIONS = {
  c: { toBase: v => v, fromBase: v => v },
  f: { toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
  k: { toBase: v => v - 273.15, fromBase: v => v + 273.15 },
};

// Canonical unit -> every accepted spelling (canonical included)
const SPELLINGS = {
  // mass
  mg: ['milligrams', 'milligram', 'mg'],
  g: ['grams', 'gram', 'g'],
  oz: ['ounces', 'ounce', 'oz'],
  lb: ['pounds', 'pound', 'lbs', 'lb'],
  stone: ['stones', 'stone'],
  kg: ['kilograms', 'kilogram', 'kg'],
  t: ['tonnes', 'tonne', 't'],
  // volume
  ml: ['millilitres', 'millilitre', 'milliliters', 'milliliter', 'ml'],
  tsp: ['teaspoons', 'teaspoon', 'tsp'],
  tbsp: ['tablespoons', 'tablespoon', 'tbsp'],
  floz: ['fluid ounces', 'fluid oz', 'fl oz', 'floz'],
  cup: ['cups', 'cup'],
  pint: ['pints', 'pint', 'pt'],
  quart: ['quarts', 'quart', 'qt'],
  l: ['litres', 'litre', 'liters', 'liter', 'l'],
  gallon: ['gallons', 'gallon', 'gal'],
  // length
  mm: ['millimetres', 'millimeters', 'mm'],
  cm: ['centimetres', 'centimeters', 'cm'],
  m: ['metres', 'meters', 'metre', 'meter', 'm'],
  km: ['kilometres', 'kilometers', 'kilometre', 'kilometer', 'km'],
  inch: ['inches', 'inch'],
  ft: ['feet', 'foot', 'ft'],
  yd: ['yards', 'yard', 'yd'],
  mi: ['miles', 'mile', 'mi'],
  // area
  sqm: ['square metres', 'square meters', 'square metre', 'square meter', 'sqm', 'm2'],
  sqft: ['square feet', 'square foot', 'sqft', 'ft2'],
  acre: ['acres', 'acre'],
  ha: ['hectares', 'hectare', 'ha'],
  sqkm: ['square kilometres', 'square kilometers', 'sqkm', 'km2'],
  sqmi: ['square miles', 'square mile', 'sqmi', 'mi2'],
  // data
  b: ['bytes', 'byte', 'b'],
  kb: ['kilobytes', 'kb'],
  mb: ['megabytes', 'mb'],
  gb: ['gigabytes', 'gb'],
  tb: ['terabytes', 'tb'],
  // time
  ms: ['milliseconds', 'millisecond', 'ms'],
  sec: ['seconds', 'second', 'secs', 'sec'],
  min: ['minutes', 'minute', 'mins', 'min'],
  hr: ['hours', 'hour', 'hrs', 'hr'],
  day: ['days', 'day'],
  week: ['weeks', 'week'],
  month: ['months', 'month'],
  year: ['years', 'year'],
  // speed
  kph: ['kilometres per hour', 'kilometers per hour', 'kilometre per hour', 'kilometer per hour',
        'kmph', 'km/hr', 'km/h', 'k/hr', 'kph', 'kmh'],
  mph: ['miles per hour', 'mile per hour', 'mph'],
  mps: ['metres per second', 'meters per second', 'metre per second', 'meter per second', 'm/s', 'mps'],
  fps: ['feet per second', 'foot per second', 'ft/s', 'fps'],
  knot: ['knots', 'knot', 'kn'],
  // temperature
  c: ['celsius', 'c'],
  f: ['fahrenheit', 'f'],
  k: ['kelvin'],
};

// Single letters stay case-sensitive so "5M" isn't read as metres
export const LOWERCASE_ONLY = new Set(['m', 'f', 'c']);

// Quote marks are handled as bare terminals, not spellings
export const SYMBOL_UNITS = { '"': 'inch', "'": 'ft' };

const ALIASES = {};
for (const [canonical, spellings] of Object.entries(SPELLINGS)) {
  for (const s of spellings) ALIASES[s] = canonical;
}
Object.assign(ALIASES, SYMBOL_UNITS);

export function normalizeUnit(raw) {
  const u = raw.toLowerCase();
  return ALIASES[u] || u;
}

export const UNIT_TO_GROUP = {};
for (const [group, units] of Object.entries(UNIT_GROUPS)) {
  for (const unit of Object.keys(units)) UNIT_TO_GROUP[unit] = group;
}
for (const u of Object.keys(TEMP_CONVERSIONS)) UNIT_TO_GROUP[u] = 'temperature';

// Longest first so "grams" wins over "g" and "km/h" over "km"
export const UNIT_SPELLINGS = Object.values(SPELLINGS)
  .flat()
  .sort((a, b) => b.length - a.length || a.localeCompare(b));

// Which units a result may be rescaled into automatically (e.g. 20kg + 1900g -> 21.9 kg).
// Imperial mass and the smaller area units are conversion-only: they'd otherwise win
// the "largest unit >= 1" contest and turn 21900g into 3.45 stone.
const AUTO_UNITS = {
  mass: ['mg', 'g', 'kg', 't'],
  area: ['sqm', 'ha', 'sqkm'],
};

// Pre-sorted by scale descending, for picking the most readable unit
export const SORTED_UNITS = {};
for (const [group, units] of Object.entries(UNIT_GROUPS)) {
  const allowed = AUTO_UNITS[group] || Object.keys(units);
  SORTED_UNITS[group] = allowed.map(u => [u, units[u]]).sort((a, b) => b[1] - a[1]);
}

// How a canonical unit is written in results
export const UNIT_DISPLAY = {
  kph: 'km/h', mps: 'm/s', fps: 'ft/s',
  sqm: 'm²', sqft: 'ft²', sqkm: 'km²', sqmi: 'mi²',
  c: '°C', f: '°F', k: 'K',
};

export const TZ_MAP = {
  UTC:  'UTC',
  GMT:  'Europe/London',
  BST:  'Europe/London',
  CET:  'Europe/Paris',
  CEST: 'Europe/Paris',
  EET:  'Europe/Athens',
  EEST: 'Europe/Athens',
  EST:  'America/New_York',
  EDT:  'America/New_York',
  CST:  'America/Chicago',
  CDT:  'America/Chicago',
  MST:  'America/Denver',
  MDT:  'America/Denver',
  PST:  'America/Los_Angeles',
  PDT:  'America/Los_Angeles',
  AKST: 'America/Anchorage',
  AKDT: 'America/Anchorage',
  HST:  'Pacific/Honolulu',
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  ACST: 'Australia/Adelaide',
  AWST: 'Australia/Perth',
  JST:  'Asia/Tokyo',
  KST:  'Asia/Seoul',
  IST:  'Asia/Kolkata',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',
};

// Longest first so EEST matches before EST
export const TZ_LABELS = Object.keys(TZ_MAP).sort((a, b) => b.length - a.length || a.localeCompare(b));
