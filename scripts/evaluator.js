import { grammarSource } from './grammar.js';
import { convertCurrency, getDefaultCurrencyCode, SYMBOL_TO_CODE, CODE_TO_SYMBOL } from './currency.js';

const UNIT_GROUPS = {
  mass:   { mg: 0.001, g: 1, kg: 1000 },
  volume: { ml: 1, tsp: 5, tbsp: 15, floz: 29.5735, cup: 236.588, pint: 473.176, quart: 946.353, l: 1000, gallon: 3785.41 },
  length: { mm: 1, cm: 10, m: 1000, km: 1000000, inch: 25.4, ft: 304.8, yd: 914.4, mi: 1609344 },
  data:   { b: 1, kb: 1024, mb: 1048576, gb: 1073741824 },
  time:   { sec: 1, min: 60, hr: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 },
  speed:  { kph: 1, mph: 1.60934, mps: 3.6, fps: 1.09728, knot: 1.852 },
};

const TEMP_CONVERSIONS = {
  c: { toBase: v => v, fromBase: v => v },
  f: { toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
  k: { toBase: v => v - 273.15, fromBase: v => v + 273.15 },
};

const UNIT_TO_GROUP = {};
for (const [group, units] of Object.entries(UNIT_GROUPS)) {
  for (const unit of Object.keys(units)) {
    UNIT_TO_GROUP[unit] = group;
  }
}
for (const u of Object.keys(TEMP_CONVERSIONS)) {
  UNIT_TO_GROUP[u] = 'temperature';
}

function normalizeUnit(raw) {
  const u = raw.toLowerCase();
  const aliases = {
    secs: 'sec', mins: 'min', hrs: 'hr', hour: 'hr', hours: 'hr',
    days: 'day', weeks: 'week', months: 'month', years: 'year',
    inches: 'inch', '"': 'inch', "'": 'ft',
    feet: 'ft', foot: 'ft',
    yards: 'yd', yard: 'yd',
    miles: 'mi', mile: 'mi',
    teaspoons: 'tsp', teaspoon: 'tsp',
    tablespoons: 'tbsp', tablespoon: 'tbsp',
    cups: 'cup',
    'fl oz': 'floz', 'fluid oz': 'floz',
    pints: 'pint', pt: 'pint',
    quarts: 'quart', qt: 'quart',
    gallons: 'gallon', gal: 'gallon',
    grams: 'g', gram: 'g',
    'km/h': 'kph', 'km/hr': 'kph', 'k/hr': 'kph', kmh: 'kph', kmph: 'kph',
    'kilometres per hour': 'kph', 'kilometers per hour': 'kph',
    'kilometre per hour': 'kph', 'kilometer per hour': 'kph',
    'm/s': 'mps',
    'meters per second': 'mps', 'meter per second': 'mps',
    'metres per second': 'mps', 'metre per second': 'mps',
    'miles per hour': 'mph', 'mile per hour': 'mph',
    'ft/s': 'fps',
    'feet per second': 'fps', 'foot per second': 'fps',
    knots: 'knot', kn: 'knot',
    celsius: 'c', fahrenheit: 'f', kelvin: 'k',
  };
  return aliases[u] || u;
}

function toBase(value, unit) {
  const u = normalizeUnit(unit);
  if (TEMP_CONVERSIONS[u]) {
    return { value: TEMP_CONVERSIONS[u].toBase(value), group: 'temperature', unit: u };
  }
  const group = UNIT_TO_GROUP[u];
  if (!group) return { value, group: null, unit: u };
  return { value: value * UNIT_GROUPS[group][u], group };
}

function fromBase(baseValue, targetUnit) {
  const u = normalizeUnit(targetUnit);
  if (TEMP_CONVERSIONS[u]) {
    return TEMP_CONVERSIONS[u].fromBase(baseValue);
  }
  const group = UNIT_TO_GROUP[u];
  if (!group) return baseValue;
  return baseValue / UNIT_GROUPS[group][u];
}

// Pre-sorted by scale descending to avoid re-sorting on every call
const SORTED_UNITS = {};
for (const [group, units] of Object.entries(UNIT_GROUPS)) {
  SORTED_UNITS[group] = Object.entries(units).sort((a, b) => b[1] - a[1]);
}

function bestUnit(baseValue, group) {
  if (group === 'temperature') return { value: baseValue, unit: 'c' };
  if (!group || !SORTED_UNITS[group]) return { value: baseValue, unit: null };
  const sorted = SORTED_UNITS[group];
  for (const [unit, scale] of sorted) {
    const display = baseValue / scale;
    if (Math.abs(display) >= 1) {
      return { value: display, unit };
    }
  }
  const smallest = sorted[sorted.length - 1];
  return { value: baseValue / smallest[1], unit: smallest[0] };
}

function result(value, prefix = '', unit = null, unitGroup = null, currencyCode = null) {
  const r = { value, prefix, unit, unitGroup };
  if (currencyCode) r.currencyCode = currencyCode;
  return r;
}

function parseNum(s) {
  return parseFloat(s.replace(/,/g, ''));
}

function mergeUnits(a, b) {
  if (a.unitGroup === 'temperature' || b.unitGroup === 'temperature') {
    if (a.unitGroup === 'temperature' && b.unitGroup === 'temperature') {
      return { unitGroup: 'temperature', aBase: toBase(a.value, a.unit).value, bBase: toBase(b.value, b.unit).value };
    }
    return null;
  }
  if (a.unitGroup && b.unitGroup && a.unitGroup === b.unitGroup) {
    return { unitGroup: a.unitGroup, aBase: toBase(a.value, a.unit).value, bBase: toBase(b.value, b.unit).value };
  }
  if (a.unitGroup && !b.unitGroup) {
    return { unitGroup: a.unitGroup, aBase: toBase(a.value, a.unit).value, bBase: b.value * UNIT_GROUPS[a.unitGroup][a.unit] };
  }
  if (!a.unitGroup && b.unitGroup) {
    return { unitGroup: b.unitGroup, aBase: a.value * UNIT_GROUPS[b.unitGroup][b.unit], bBase: toBase(b.value, b.unit).value };
  }
  return null;
}

function combineResults(a, b, subtract = false) {
  const op = subtract ? (x, y) => x - y : (x, y) => x + y;
  const prefix = a.prefix || b.prefix;
  if (a.currencyCode && b.currencyCode && a.currencyCode !== b.currencyCode) {
    const bConverted = convertCurrency(b.value, b.currencyCode, a.currencyCode);
    if (bConverted !== null) {
      return result(op(a.value, bConverted), a.prefix || CODE_TO_SYMBOL[a.currencyCode] || '', null, 'currency', a.currencyCode);
    }
  }
  if (a.currencyCode || b.currencyCode) {
    const code = a.currencyCode || b.currencyCode;
    return result(op(a.value, b.value), prefix, null, 'currency', code);
  }
  const merged = mergeUnits(a, b);
  if (merged) {
    const baseVal = op(merged.aBase, merged.bBase);
    const best = bestUnit(baseVal, merged.unitGroup);
    return result(best.value, prefix, best.unit, merged.unitGroup);
  }
  return result(op(a.value, b.value), prefix);
}

function multiplyResults(a, b) {
  const prefix = a.prefix || b.prefix;
  const unit = a.unit || b.unit;
  const unitGroup = a.unitGroup || b.unitGroup;
  const code = a.currencyCode || b.currencyCode || null;
  if ((a.unitGroup === 'speed' && b.unitGroup === 'time') ||
      (a.unitGroup === 'time' && b.unitGroup === 'speed')) {
    const spd = a.unitGroup === 'speed' ? a : b;
    const tm = a.unitGroup === 'time' ? a : b;
    const speedKph = toBase(spd.value, spd.unit).value;
    const timeHr = toBase(tm.value, tm.unit).value / 3600;
    return result(speedKph * timeHr, prefix, 'km', 'length');
  }
  if (a.unitGroup && b.unitGroup) {
    return result(a.value * b.value, prefix, a.unit, a.unitGroup, a.currencyCode);
  }
  return result(a.value * b.value, prefix, unit, unitGroup, code);
}

function divideResults(a, b) {
  const prefix = a.prefix || b.prefix;
  if (b.value === 0) return result(0, prefix);
  if (a.currencyCode && b.currencyCode) {
    if (a.currencyCode !== b.currencyCode) {
      const bConverted = convertCurrency(b.value, b.currencyCode, a.currencyCode);
      if (bConverted !== null) return result(a.value / bConverted, '');
    }
    return result(a.value / b.value, '');
  }
  if (a.unitGroup && b.unitGroup && a.unitGroup === b.unitGroup) {
    const merged = mergeUnits(a, b);
    return result(merged.aBase / merged.bBase, prefix);
  }
  if (a.unitGroup === 'length' && b.unitGroup === 'speed') {
    const lengthKm = toBase(a.value, a.unit).value / 1000000;
    const speedKph = toBase(b.value, b.unit).value;
    return result(lengthKm / speedKph, prefix, 'hr', 'time');
  }
  if (a.unitGroup === 'length' && b.unitGroup === 'time') {
    const lengthKm = toBase(a.value, a.unit).value / 1000000;
    const timeHr = toBase(b.value, b.unit).value / 3600;
    return result(lengthKm / timeHr, prefix, 'kph', 'speed');
  }
  return result(a.value / b.value, prefix, a.unit, a.unitGroup, a.currencyCode);
}

export class State {
  constructor() {
    this.variables = new Map();
    this.sumAccumulator = [];
    this.previousResult = null;
  }

  resetAccumulator() {
    this.sumAccumulator = [];
  }

  setVariable(name, type, res) {
    const entry = { type, ...res };
    this.variables.set(name, entry);
    if (type === 'variable') {
      this.sumAccumulator.push(entry);
    }
  }

  getVariable(name) {
    const v = this.variables.get(name);
    if (!v) return null;
    return result(v.value, v.prefix, v.unit, v.unitGroup, v.currencyCode);
  }

  computeSum() {
    let sum = 0, prefix = '', unit = null, unitGroup = null;
    for (const v of this.sumAccumulator) {
      sum += v.value;
      if (v.prefix) prefix = v.prefix;
      if (v.unit) { unit = v.unit; unitGroup = v.unitGroup; }
    }
    this.sumAccumulator = [];
    return result(sum, prefix, unit, unitGroup);
  }

  computeAverage() {
    const len = this.sumAccumulator.length;
    if (len === 0) return result(0);
    const sum = this.computeSum();
    return result(sum.value / len, sum.prefix, sum.unit, sum.unitGroup);
  }

  getPrevious() {
    return this.previousResult || result(0);
  }
}

const TZ_MAP = {
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

function timezoneResult(date, tzLabel, ianaZone) {
  return { value: date.getTime(), prefix: '', unit: null, unitGroup: null, timezone: { label: tzLabel, iana: ianaZone } };
}

const datePartsFmtCache = new Map();
const fullFmtCache = new Map();

function getDatePartsFmt(tz) {
  let fmt = datePartsFmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    datePartsFmtCache.set(tz, fmt);
  }
  return fmt;
}

function getFullFmt(tz) {
  let fmt = fullFmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fullFmtCache.set(tz, fmt);
  }
  return fmt;
}

function buildDateFromTime(hours, minutes, sourceIana) {
  const now = new Date();
  const parts = getDatePartsFmt(sourceIana).formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const naive = new Date(`${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  const utcMs = new Date(getFullFmt('UTC').format(now)).getTime();
  const srcMs = new Date(getFullFmt(sourceIana).format(now)).getTime();
  return new Date(naive.getTime() - (srcMs - utcMs));
}

function compound(principal, annualRate, years, frequency) {
  if (!frequency) frequency = 12;
  const r = annualRate / 100;
  return principal * Math.pow(1 + r / frequency, frequency * years);
}

function convertUnits(val, targetUnitStr) {
  const target = normalizeUnit(targetUnitStr);
  const group = UNIT_TO_GROUP[target];
  if (group === 'temperature' && val.unitGroup === 'temperature') {
    const baseVal = toBase(val.value, val.unit).value;
    const converted = fromBase(baseVal, target);
    return result(converted, val.prefix, target, 'temperature');
  }
  if (group && val.unitGroup === group) {
    const baseVal = toBase(val.value, val.unit).value;
    const converted = fromBase(baseVal, target);
    return result(converted, val.prefix, target, group);
  }
  // Volume ↔ mass using water density (1ml = 1g)
  if (val.unitGroup === 'volume' && group === 'mass') {
    const ml = toBase(val.value, val.unit).value;
    return result(fromBase(ml, target), val.prefix, target, group);
  }
  if (val.unitGroup === 'mass' && group === 'volume') {
    const g = toBase(val.value, val.unit).value;
    return result(fromBase(g, target), val.prefix, target, group);
  }
  return val;
}

function evalCurrencyConversion(val, targetCodeNode) {
  const toCode = targetCodeNode.sourceString.trim().toLowerCase();
  const fromCode = val.currencyCode || getDefaultCurrencyCode();
  const converted = convertCurrency(val.value, fromCode, toCode);
  if (converted === null) return val;
  const prefix = CODE_TO_SYMBOL[toCode] || '';
  return result(converted, prefix, null, 'currency', toCode);
}

function normalizeAmPm(h, period) {
  period = period.toLowerCase();
  if (period === 'pm' && h !== 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  return h;
}

let _grammar = null;
let _semantics = null;

export function getGrammarAndSemantics() {
  if (_grammar) return { grammar: _grammar, semantics: _semantics };

  _grammar = ohm.grammar(grammarSource);
  _semantics = _grammar.createSemantics().addOperation('eval(state)', {

    Line(node) { return node.eval(this.args.state); },

    // --- Percentage queries ---
    PercentQuery_whatPercentOf(value, _is, _what, _pct, _of, total) {
      const s = this.args.state;
      const v = value.eval(s);
      const t = total.eval(s);
      if (t.value === 0) return result(0, '', '%', null);
      return result((v.value / t.value) * 100, '', '%', null);
    },
    PercentQuery_isPercentOfWhat(knownResult, _is, pctExpr, _of, _what) {
      const s = this.args.state;
      const r = knownResult.eval(s);
      const p = pctExpr.eval(s);
      if (p.value === 0) return result(0, r.prefix);
      return result(r.value / p.value, r.prefix, r.unit, r.unitGroup);
    },
    PercentQuery_percentChange(from, _to, to, _is, _what, _pct) {
      const s = this.args.state;
      const f = from.eval(s);
      const t = to.eval(s);
      if (f.value === 0) return result(0, '', '%', null);
      return result(((t.value - f.value) / f.value) * 100, '', '%', null);
    },
    PercentQuery_isPercentOffWhat(knownResult, _is, pctExpr, _off, _what) {
      const s = this.args.state;
      const r = knownResult.eval(s);
      const p = pctExpr.eval(s);
      const factor = 1 - p.value;
      if (factor === 0) return result(0, r.prefix);
      return result(r.value / factor, r.prefix, r.unit, r.unitGroup);
    },

    Calculation_inPercent(expr, _inKw, _aKw, _pctWord) {
      const val = expr.eval(this.args.state);
      return result(val.value * 100, '', '%', null);
    },
    Calculation_inCurrency(expr, _inKw, targetCode) {
      return evalCurrencyConversion(expr.eval(this.args.state), targetCode);
    },
    Calculation_toCurrency(expr, _toKw, targetCode) {
      return evalCurrencyConversion(expr.eval(this.args.state), targetCode);
    },
    Calculation_conversion(expr, _inKw, targetUnit) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_toConversion(expr, _toKw, targetUnit) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_intoConversion(expr, _intoKw, targetUnit) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_asPercent(expr, _asKw, _aKw, _pctWord) {
      const val = expr.eval(this.args.state);
      return result(val.value * 100, '', '%', null);
    },
    Calculation_asConversion(expr, _asKw, targetUnit) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_howManyConversion(_howKw, _manyKw, targetUnit, _inKw, expr) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_reverseConversion(targetUnit, _inKw, expr) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation(expr) { return expr.eval(this.args.state); },

    FromNow(expr, _fromKw, _nowKw) {
      const s = this.args.state;
      const val = expr.eval(s);
      let offsetMs;
      if (val.unitGroup === 'time') {
        offsetMs = toBase(val.value, val.unit).value * 1000;
      } else {
        offsetMs = val.value * 1000;
      }
      return result(Date.now() + offsetMs, '', null, null);
    },

    // --- Timezone conversion ---
    TimezoneConversion_convert(timeLit, srcTz, _inKw, tgtTz) {
      const { hours, minutes } = timeLit.eval(this.args.state);
      const srcLabel = srcTz.sourceString.trim().toUpperCase();
      const tgtLabel = tgtTz.sourceString.trim().toUpperCase();
      const srcIana = TZ_MAP[srcLabel];
      const tgtIana = TZ_MAP[tgtLabel];
      if (!srcIana || !tgtIana) return null;
      const utcDate = buildDateFromTime(hours, minutes, srcIana);
      return timezoneResult(utcDate, tgtLabel, tgtIana);
    },
    TimezoneConversion_nowInTz(_dateKw, _inKw, tgtTz) {
      const tgtLabel = tgtTz.sourceString.trim().toUpperCase();
      const tgtIana = TZ_MAP[tgtLabel];
      if (!tgtIana) return null;
      return timezoneResult(new Date(), tgtLabel, tgtIana);
    },
    timeLiteral_colonAmPm(hourNum, _colon, minNum, ampmNode) {
      return { hours: normalizeAmPm(parseInt(hourNum.sourceString), ampmNode.sourceString), minutes: parseInt(minNum.sourceString) };
    },
    timeLiteral_colon24(hourNum, _colon, minNum) {
      return { hours: parseInt(hourNum.sourceString), minutes: parseInt(minNum.sourceString) };
    },
    timeLiteral_bareAmPm(hourNum, ampmNode) {
      return { hours: normalizeAmPm(parseInt(hourNum.sourceString), ampmNode.sourceString), minutes: 0 };
    },

    // --- Arithmetic ---
    Expression_add(left, op, right) {
      const s = this.args.state;
      const l = left.eval(s);
      const r = right.eval(s);
      const opStr = op.sourceString.trim();
      const isSub = opStr === '-' || opStr === 'minus' || opStr === 'without';
      // Percent modifier: X + 30% = X * 1.3, X - 30% = X * 0.7
      if (r.isPercent && !l.isPercent) {
        const factor = isSub ? (1 - r.value) : (1 + r.value);
        return result(l.value * factor, l.prefix, l.unit, l.unitGroup, l.currencyCode);
      }
      return combineResults(l, r, isSub);
    },
    Expression(node) { return node.eval(this.args.state); },

    Term_mul(left, op, right) {
      const s = this.args.state;
      const l = left.eval(s);
      const r = right.eval(s);
      const opStr = op.sourceString.trim();
      if (opStr === '/' || opStr === '\u00f7' || opStr === 'divided by' || opStr === 'divided') {
        return divideResults(l, r);
      }
      return multiplyResults(l, r);
    },
    Term(node) { return node.eval(this.args.state); },

    Power_pow(base, _, exp) {
      const s = this.args.state;
      const b = base.eval(s);
      const e = exp.eval(s);
      return result(Math.pow(b.value, e.value), b.prefix, b.unit, b.unitGroup);
    },
    Power(node) { return node.eval(this.args.state); },

    Factor_paren(_open, expr, _close) {
      return expr.eval(this.args.state);
    },
    Factor(node) { return node.eval(this.args.state); },

    // --- Currency ---
    CurrencyWithCode(num, kSuffix, codeNode) {
      let val = parseNum(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      const code = codeNode.sourceString.trim().toLowerCase();
      const prefix = CODE_TO_SYMBOL[code] || '';
      return result(val, prefix, null, 'currency', code);
    },

    Currency(symbol, num, kSuffix) {
      let val = parseNum(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      const sym = symbol.sourceString;
      const code = SYMBOL_TO_CODE[sym] ?? getDefaultCurrencyCode();
      return result(val, sym, null, 'currency', code);
    },

    // --- Numbers ---
    NumberLit(num, kSuffix) {
      let val = parseNum(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      return result(val);
    },

    number_commaDecimal(_d1, _d2, _d3, _commas, _cd1, _cd2, _cd3, _dot, _frac) {
      return result(parseNum(this.sourceString));
    },
    number_decimal(_int, _dot, _frac) {
      return result(parseFloat(this.sourceString));
    },
    number_commaWhole(_d1, _d2, _d3, _commas, _cd1, _cd2, _cd3) {
      return result(parseNum(this.sourceString));
    },
    number_whole(_digits) {
      return result(parseFloat(this.sourceString));
    },

    // --- Quantities (units) ---
    Quantity_frac(fq) {
      return fq.eval(this.args.state);
    },
    Quantity_simple(num, suffix) {
      const raw = parseNum(num.sourceString);
      const unit = normalizeUnit(suffix.sourceString);
      const group = UNIT_TO_GROUP[unit];
      return result(raw, '', unit, group || null);
    },

    fracQuantity(num1, _slash, num2, suffix) {
      const raw = parseNum(num1.sourceString) / parseNum(num2.sourceString);
      const unit = normalizeUnit(suffix.sourceString);
      const group = UNIT_TO_GROUP[unit];
      return result(raw, '', unit, group || null);
    },

    // --- Bare percent (modifier) ---
    Percent(num, _pct) {
      const p = parseNum(num.sourceString);
      const r = result(p / 100);
      r.isPercent = true;
      return r;
    },


    // --- Percentages ---
    PercentOf(num, _pct, _of, expr) {
      const p = parseNum(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(p / 100 * val.value, val.prefix, val.unit, val.unitGroup);
    },

    PercentOff(num, _pct, _off, expr) {
      const p = parseNum(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(val.value - (p / 100 * val.value), val.prefix, val.unit, val.unitGroup);
    },

    PercentOn(num, _pct, _on, expr) {
      const p = parseNum(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(val.value + (p / 100 * val.value), val.prefix, val.unit, val.unitGroup);
    },

    // --- Compound Interest ---
    CompoundInterest_full(expr, _forKw, durationExpr, _yearWord, _atKw, rate, _pct, _compKw, freqWord) {
      const s = this.args.state;
      const val = expr.eval(s);
      const years = durationExpr.eval(s).value;
      const r = parseNum(rate.sourceString);
      const freqMap = { monthly: 12, quarterly: 4, annually: 1, yearly: 1, daily: 365, weekly: 52 };
      const freqStr = freqWord.sourceString.trim().toLowerCase();
      const frequency = freqMap[freqStr] || 12;
      const accumulated = compound(val.value, r, years, frequency);
      return result(accumulated, val.prefix, val.unit, val.unitGroup);
    },
    CompoundInterest_simple(expr, _atKw, rate, _pct, _paKw) {
      const val = expr.eval(this.args.state);
      const r = parseNum(rate.sourceString);
      const accumulated = compound(val.value, r, 1, 12);
      return result(accumulated, val.prefix, val.unit, val.unitGroup);
    },

    // --- Variables ---
    Variable(name, op, expr) {
      const s = this.args.state;
      const val = expr.eval(s);
      const varName = name.sourceString.trim();
      const assignStr = op.sourceString.trim();
      const type = assignStr === '=' ? 'constant' : 'variable';
      s.setVariable(varName, type, val);
      return val;
    },

    VariableRef(name) {
      const s = this.args.state;
      const varName = name.sourceString.trim();
      const v = s.getVariable(varName);
      if (v) return v;
      return result(0);
    },

    varName(_start, _rest) {
      return result(0);
    },

    // --- Aggregation ---
    Sum(_kw) {
      return this.args.state.computeSum();
    },

    Prev(_kw) {
      return this.args.state.getPrevious();
    },

    Average(_kw) {
      return this.args.state.computeAverage();
    },

    // --- Date/Time ---
    DateTime(_kw) {
      return result(Date.now(), '', null, null);
    },

    // --- Comments ---
    Comment(_node) {
      return null;
    },
    lineComment(_slashes, _chars) {
      return null;
    },
    inlineComment(_open, _chars, _close) {
      return null;
    },

    // --- Fallback ---
    WordsLine(_chars) {
      return null;
    },

    // --- Catch-all for operator nodes ---
    addOp(_) { return null; },
    mulOp(_) { return null; },
    assignOp(_) { return null; },
    isKw(_is, _space) { return null; },
    currencySymbol(_) { return null; },
    currencyCode(_) { return null; },
    kSuffix(_) { return null; },
    unitSuffix(_) { return null; },
    sumKw(_) { return null; },
    prevKw(_) { return null; },
    avgKw(_) { return null; },
    dateKw(_) { return null; },
    ampm(_) { return null; },
    timezone(_) { return null; },
    atKw(_) { return null; },
    paKw(_) { return null; },
    forKw(_) { return null; },
    yearWord(_) { return null; },
    compoundingKw(_) { return null; },
    frequencyWord(_) { return null; },
    fromKw(_) { return null; },
    nowKw(_) { return null; },
    inKw(_) { return null; },
    intoKw(_) { return null; },
    toKw(_) { return null; },
    asKw(_) { return null; },
    aKw(_) { return null; },
    pctWord(_) { return null; },
    pctQWord(_) { return null; },
    whatKw(_) { return null; },
    ofKw(_) { return null; },
    offKw(_) { return null; },
    reserved(_) { return null; },
    nameStart(_) { return null; },
    nameRest(_) { return null; },
    wordChar(_) { return null; },

    _terminal() { return null; },
    _iter(...children) { return children.map(c => c.eval(this.args.state)); },
  });

  return { grammar: _grammar, semantics: _semantics };
}

export function evaluate(input) {
  const { grammar, semantics } = getGrammarAndSemantics();
  const state = new State();
  const lines = input.split('\n');
  const results = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed === '---') {
      results.push(null);
      continue;
    }

    try {
      const match = grammar.match(trimmed);
      if (match.succeeded()) {
        const res = semantics(match).eval(state);
        if (res && res.value !== undefined) {
          state.previousResult = res;
        }
        results.push(res);
      } else {
        results.push(null);
      }
    } catch (e) {
      results.push(null);
    }
  }

  return results;
}
