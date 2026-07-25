import { grammarSource } from './grammar.js';
import { convertCurrency, getDefaultCurrencyCode, resolveSymbol, currencyPrefix } from './currency.js';
import {
  UNIT_GROUPS, TEMP_CONVERSIONS, UNIT_TO_GROUP, SORTED_UNITS, normalizeUnit, TZ_MAP,
} from './tables.js';

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
  if (TEMP_CONVERSIONS[u]) return TEMP_CONVERSIONS[u].fromBase(baseValue);
  const group = UNIT_TO_GROUP[u];
  if (!group) return baseValue;
  return baseValue / UNIT_GROUPS[group][u];
}

// Pick the largest unit that keeps the display value >= 1
function bestUnit(baseValue, group, preferUnit) {
  if (group === 'temperature') {
    const unit = TEMP_CONVERSIONS[preferUnit] ? preferUnit : 'c';
    return { value: fromBase(baseValue, unit), unit };
  }
  const sorted = SORTED_UNITS[group];
  if (!sorted) return { value: baseValue, unit: null };
  // Conversion-only units keep their own unit: 5 lb + 3 lb is 8 lb, not 3.63 kg
  if (preferUnit && UNIT_TO_GROUP[preferUnit] === group && !sorted.some(([u]) => u === preferUnit)) {
    return { value: fromBase(baseValue, preferUnit), unit: preferUnit };
  }
  for (const [unit, scale] of sorted) {
    const display = baseValue / scale;
    if (Math.abs(display) >= 1) return { value: display, unit };
  }
  const [unit, scale] = sorted[sorted.length - 1];
  return { value: baseValue / scale, unit };
}

function result(value, prefix = '', unit = null, unitGroup = null, currencyCode = null) {
  const r = { value, prefix, unit, unitGroup };
  if (currencyCode) r.currencyCode = currencyCode;
  return r;
}

function dateResult(ms) {
  return { value: ms, prefix: '', unit: null, unitGroup: null, isDate: true };
}

function parseNum(s) {
  return parseFloat(s.replace(/,/g, ''));
}

function mergeUnits(a, b) {
  const aTemp = a.unitGroup === 'temperature';
  const bTemp = b.unitGroup === 'temperature';
  // A plain number added to a temperature shifts it by that many degrees
  if (aTemp || bTemp) {
    if (aTemp && bTemp) {
      return { unitGroup: 'temperature', aBase: toBase(a.value, a.unit).value, bBase: toBase(b.value, b.unit).value };
    }
    if (aTemp && !b.unitGroup) {
      return { unitGroup: 'temperature', aBase: toBase(a.value, a.unit).value, bBase: b.value };
    }
    if (bTemp && !a.unitGroup) {
      return { unitGroup: 'temperature', aBase: a.value, bBase: toBase(b.value, b.unit).value };
    }
    return null;
  }
  if (a.unitGroup && b.unitGroup) {
    if (a.unitGroup !== b.unitGroup) return null;
    return { unitGroup: a.unitGroup, aBase: toBase(a.value, a.unit).value, bBase: toBase(b.value, b.unit).value };
  }
  // A bare number takes on the unit of the other side
  if (a.unitGroup) {
    return { unitGroup: a.unitGroup, aBase: toBase(a.value, a.unit).value, bBase: b.value * UNIT_GROUPS[a.unitGroup][a.unit] };
  }
  if (b.unitGroup) {
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
      return result(op(a.value, bConverted), a.prefix || currencyPrefix(a.currencyCode), null, 'currency', a.currencyCode);
    }
  }
  if (a.currencyCode || b.currencyCode) {
    return result(op(a.value, b.value), prefix, null, 'currency', a.currencyCode || b.currencyCode);
  }
  const merged = mergeUnits(a, b);
  if (merged) {
    const best = bestUnit(op(merged.aBase, merged.bBase), merged.unitGroup, a.unit || b.unit);
    return result(best.value, prefix, best.unit, merged.unitGroup);
  }
  return result(op(a.value, b.value), prefix);
}

function multiplyResults(a, b) {
  const prefix = a.prefix || b.prefix;
  // speed x time = distance
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
  return result(a.value * b.value, prefix, a.unit || b.unit, a.unitGroup || b.unitGroup,
    a.currencyCode || b.currencyCode || null);
}

function divideResults(a, b) {
  const prefix = a.prefix || b.prefix;
  if (a.currencyCode && b.currencyCode) {
    if (a.currencyCode !== b.currencyCode) {
      const bConverted = convertCurrency(b.value, b.currencyCode, a.currencyCode);
      if (bConverted !== null) return result(a.value / bConverted, '');
    }
    return result(a.value / b.value, '');
  }
  if (a.unitGroup && a.unitGroup === b.unitGroup) {
    const merged = mergeUnits(a, b);
    return result(merged.aBase / merged.bBase, prefix);
  }
  // distance / speed = time, distance / time = speed
  if (a.unitGroup === 'length' && b.unitGroup === 'speed') {
    const lengthKm = toBase(a.value, a.unit).value / 1000000;
    return result(lengthKm / toBase(b.value, b.unit).value, prefix, 'hr', 'time');
  }
  if (a.unitGroup === 'length' && b.unitGroup === 'time') {
    const lengthKm = toBase(a.value, a.unit).value / 1000000;
    const timeHr = toBase(b.value, b.unit).value / 3600;
    return result(lengthKm / timeHr, prefix, 'kph', 'speed');
  }
  return result(a.value / b.value, prefix, a.unit, a.unitGroup, a.currencyCode);
}

const sumValues = vs => vs.reduce((a, b) => a + b, 0);

export class State {
  constructor() {
    this.variables = new Map();
    this.sumAccumulator = [];
    this.previousResult = null;
  }

  setVariable(name, type, res) {
    const entry = { type, ...res };
    this.variables.set(name, entry);
    if (type === 'variable') this.sumAccumulator.push(entry);
  }

  getVariable(name) {
    const v = this.variables.get(name);
    if (!v) return null;
    return result(v.value, v.prefix, v.unit, v.unitGroup, v.currencyCode);
  }

  // Aggregations consume the accumulator, so the next one starts fresh
  aggregate(fn) {
    const entries = this.sumAccumulator;
    this.sumAccumulator = [];
    let prefix = '', unit = null, unitGroup = null, currency = null, mixed = false;
    for (const v of entries) {
      if (v.prefix) prefix = v.prefix;
      if (v.unit) { unit = v.unit; unitGroup = v.unitGroup; }
      // Keep the code only while they agree, so yen totals print whole
      if (v.currencyCode) {
        if (currency && currency !== v.currencyCode) mixed = true;
        currency = v.currencyCode;
      }
    }
    return result(fn(entries.map(v => v.value)), prefix, unit, unitGroup, mixed ? null : currency);
  }

  computeSum() { return this.aggregate(sumValues); }
  computeAverage() { return this.aggregate(vs => vs.length ? sumValues(vs) / vs.length : 0); }
  computeMin() { return this.aggregate(vs => vs.length ? Math.min(...vs) : 0); }
  computeMax() { return this.aggregate(vs => vs.length ? Math.max(...vs) : 0); }

  computeCount() {
    const n = this.sumAccumulator.length;
    this.sumAccumulator = [];
    return result(n);
  }

  getPrevious() {
    return this.previousResult || result(0);
  }
}

function timezoneResult(date, tzLabel, ianaZone) {
  return { value: date.getTime(), prefix: '', unit: null, unitGroup: null, timezone: { label: tzLabel, iana: ianaZone } };
}

const tzPartsCache = new Map();

function getTzParts(tz) {
  let fmt = tzPartsCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    tzPartsCache.set(tz, fmt);
  }
  return fmt;
}

// Wall-clock time in a zone, as a UTC timestamp — used to derive that zone's offset
function zoneWallClockMs(date, tz) {
  const parts = {};
  for (const p of getTzParts(tz).formatToParts(date)) parts[p.type] = p.value;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second);
}

// Interpret hours:minutes as today's wall clock in sourceIana, return the real instant
function buildDateFromTime(hours, minutes, sourceIana) {
  const now = new Date();
  const offset = zoneWallClockMs(now, sourceIana) - zoneWallClockMs(now, 'UTC');
  const parts = {};
  for (const p of getTzParts(sourceIana).formatToParts(now)) parts[p.type] = p.value;
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hours, minutes, 0);
  return new Date(wall - offset);
}

function compound(principal, annualRate, years, frequency = 12) {
  const r = annualRate / 100;
  return principal * Math.pow(1 + r / frequency, frequency * years);
}

const FREQUENCIES = { monthly: 12, quarterly: 4, annually: 1, yearly: 1, daily: 365, weekly: 52 };

// Bare durations are years
function durationYears(val) {
  if (val.unitGroup !== 'time') return val.value;
  return toBase(val.value, val.unit).value / UNIT_GROUPS.time.year;
}

function evalCompound(state, expr, durationExpr, rate, freqWord) {
  const val = expr.eval(state);
  const years = durationYears(durationExpr.eval(state));
  const frequency = FREQUENCIES[freqWord.sourceString.trim().toLowerCase()] || 12;
  const accumulated = compound(val.value, parseNum(rate.sourceString), years, frequency);
  return result(accumulated, val.prefix, val.unit, val.unitGroup, val.currencyCode);
}

function convertUnits(val, targetUnitStr) {
  const target = normalizeUnit(targetUnitStr);
  const group = UNIT_TO_GROUP[target];
  if (!group || !val.unitGroup) return val;
  // Same group, or volume <-> mass via water density (1ml = 1g)
  const convertible = group === val.unitGroup ||
    (val.unitGroup === 'volume' && group === 'mass') ||
    (val.unitGroup === 'mass' && group === 'volume');
  if (!convertible) return val;
  return result(fromBase(toBase(val.value, val.unit).value, target), val.prefix, target, group);
}

function evalCurrencyConversion(val, targetCodeNode) {
  const toCode = targetCodeNode.sourceString.trim().toLowerCase();
  const fromCode = val.currencyCode || getDefaultCurrencyCode();
  const converted = convertCurrency(val.value, fromCode, toCode);
  if (converted === null) return val;
  return result(converted, currencyPrefix(toCode), null, 'currency', toCode);
}

function normalizeAmPm(h, period) {
  if (period.toLowerCase() === 'pm' && h !== 12) return h + 12;
  if (period.toLowerCase() === 'am' && h === 12) return 0;
  return h;
}

// Seconds-based offset for "x from now" / "x ago"
function offsetMs(val) {
  const secs = val.unitGroup === 'time' ? toBase(val.value, val.unit).value : val.value;
  return secs * 1000;
}

let _grammar = null;
let _semantics = null;

export function getGrammarAndSemantics() {
  if (_grammar) return { grammar: _grammar, semantics: _semantics };

  _grammar = ohm.grammar(grammarSource);
  _semantics = _grammar.createSemantics().addOperation('eval(state)', {

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
      const factor = 1 - pctExpr.eval(s).value;
      if (factor === 0) return result(0, r.prefix);
      return result(r.value / factor, r.prefix, r.unit, r.unitGroup);
    },

    Calculation_inPercent(expr, _inKw, _aKw, _pctWord) {
      return result(expr.eval(this.args.state).value * 100, '', '%', null);
    },
    Calculation_asPercent(expr, _asKw, _aKw, _pctWord) {
      return result(expr.eval(this.args.state).value * 100, '', '%', null);
    },
    Calculation_inCurrency(expr, _inKw, targetCode) {
      return evalCurrencyConversion(expr.eval(this.args.state), targetCode);
    },
    Calculation_toCurrency(expr, _toKw, targetCode) {
      return evalCurrencyConversion(expr.eval(this.args.state), targetCode);
    },
    Calculation_intoCurrency(expr, _intoKw, targetCode) {
      return evalCurrencyConversion(expr.eval(this.args.state), targetCode);
    },
    Calculation_asCurrency(expr, _asKw, targetCode) {
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
    Calculation_asConversion(expr, _asKw, targetUnit) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_howManyConversion(_howKw, _manyKw, targetUnit, _inKw, expr) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },
    Calculation_reverseConversion(targetUnit, _inKw, expr) {
      return convertUnits(expr.eval(this.args.state), targetUnit.sourceString);
    },

    // --- Relative time ---
    RelativeTime_future(expr, _fromKw, _nowKw) {
      return dateResult(Date.now() + offsetMs(expr.eval(this.args.state)));
    },
    RelativeTime_past(expr, _agoKw) {
      return dateResult(Date.now() - offsetMs(expr.eval(this.args.state)));
    },

    // --- Timezone conversion ---
    TimezoneConversion_convert(timeLit, srcTz, _inKw, tgtTz) {
      const { hours, minutes } = timeLit.eval(this.args.state);
      const srcIana = TZ_MAP[srcTz.sourceString.trim().toUpperCase()];
      const tgtLabel = tgtTz.sourceString.trim().toUpperCase();
      const tgtIana = TZ_MAP[tgtLabel];
      if (!srcIana || !tgtIana) return null;
      return timezoneResult(buildDateFromTime(hours, minutes, srcIana), tgtLabel, tgtIana);
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
        return result(l.value * (isSub ? 1 - r.value : 1 + r.value), l.prefix, l.unit, l.unitGroup, l.currencyCode);
      }
      return combineResults(l, r, isSub);
    },

    Term_mul(left, op, right) {
      const s = this.args.state;
      const l = left.eval(s);
      const r = right.eval(s);
      const opStr = op.sourceString.trim();
      const isDiv = opStr === '/' || opStr === '÷' || opStr === 'divided by' || opStr === 'divided';
      return isDiv ? divideResults(l, r) : multiplyResults(l, r);
    },

    Power_pow(base, _, exp) {
      const s = this.args.state;
      const b = base.eval(s);
      return result(Math.pow(b.value, exp.eval(s).value), b.prefix, b.unit, b.unitGroup);
    },

    Factor_neg(_minus, factor) {
      const v = factor.eval(this.args.state);
      return { ...v, value: -v.value };
    },
    Factor_paren(_open, expr, _close) {
      return expr.eval(this.args.state);
    },

    // --- Currency ---
    // Symbol ignored: the code wins
    CurrencyWithCode(_symbol, num, kSuffix, codeNode) {
      let val = parseNum(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      const code = codeNode.sourceString.trim().toLowerCase();
      return result(val, currencyPrefix(code), null, 'currency', code);
    },

    Currency(symbol, num, kSuffix) {
      let val = parseNum(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      const code = resolveSymbol(symbol.sourceString);
      return result(val, currencyPrefix(code), null, 'currency', code);
    },

    // --- Numbers ---
    NumberLit(num, kSuffix) {
      let val = parseNum(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      return result(val);
    },

    // --- Quantities (units) ---
    Quantity_simple(num, suffix) {
      const unit = normalizeUnit(suffix.sourceString);
      return result(parseNum(num.sourceString), '', unit, UNIT_TO_GROUP[unit] || null);
    },

    fracQuantity(num1, _slash, num2, suffix) {
      const unit = normalizeUnit(suffix.sourceString);
      const raw = parseNum(num1.sourceString) / parseNum(num2.sourceString);
      return result(raw, '', unit, UNIT_TO_GROUP[unit] || null);
    },

    // --- Bare percent (modifier) ---
    Percent(num, _pct) {
      const r = result(parseNum(num.sourceString) / 100);
      r.isPercent = true;
      return r;
    },

    // --- Percentages ---
    PercentOf(num, _pct, _of, expr) {
      const p = parseNum(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(p / 100 * val.value, val.prefix, val.unit, val.unitGroup, val.currencyCode);
    },

    PercentOff(num, _pct, _off, expr) {
      const p = parseNum(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(val.value * (1 - p / 100), val.prefix, val.unit, val.unitGroup, val.currencyCode);
    },

    PercentOn(num, _pct, _on, expr) {
      const p = parseNum(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(val.value * (1 + p / 100), val.prefix, val.unit, val.unitGroup, val.currencyCode);
    },

    // --- Compound Interest ---
    CompoundInterest_full(expr, _forKw, durationExpr, _atKw, rate, _pct, _compKw, freqWord) {
      return evalCompound(this.args.state, expr, durationExpr, rate, freqWord);
    },
    CompoundInterest_rateFirst(expr, _atKw, rate, _pct, _paKw, _compKw, freqWord, _forKw, durationExpr) {
      return evalCompound(this.args.state, expr, durationExpr, rate, freqWord);
    },
    CompoundInterest_simple(expr, _atKw, rate, _pct, _paKw) {
      const val = expr.eval(this.args.state);
      const accumulated = compound(val.value, parseNum(rate.sourceString), 1, 12);
      return result(accumulated, val.prefix, val.unit, val.unitGroup, val.currencyCode);
    },

    // --- Variables ---
    Variable(name, op, expr) {
      const s = this.args.state;
      const val = expr.eval(s);
      const type = op.sourceString.trim() === '=' ? 'constant' : 'variable';
      s.setVariable(name.sourceString.trim(), type, val);
      return val;
    },

    VariableRef(name) {
      return this.args.state.getVariable(name.sourceString.trim()) || result(0);
    },

    // --- Aggregation ---
    Sum(_kw) { return this.args.state.computeSum(); },
    Prev(_kw) { return this.args.state.getPrevious(); },
    Average(_kw) { return this.args.state.computeAverage(); },
    Minimum(_kw) { return this.args.state.computeMin(); },
    Maximum(_kw) { return this.args.state.computeMax(); },
    Count(_kw) { return this.args.state.computeCount(); },

    // --- Date/Time ---
    DateTime(_kw) { return dateResult(Date.now()); },

    // --- Non-values: comments, prose, keywords, operators ---
    WordsLine(_chars) { return null; },
    _terminal() { return null; },
    _iter(...children) { return children.map(c => c.eval(this.args.state)); },
    // Single-child rules pass through (Line, Expression, Term, Factor, ...);
    // multi-child lexical rules like keywords and operators carry no value.
    _nonterminal(...children) {
      return children.length === 1 ? children[0].eval(this.args.state) : null;
    },
  });

  return { grammar: _grammar, semantics: _semantics };
}

// Parsing dominates evaluation cost, and most lines are unchanged between
// keystrokes, so cache the match per line. MatchResults are safe to reuse:
// addOperation isn't memoized, so each eval re-runs against fresh state.
const matchCache = new Map();
const MATCH_CACHE_MAX = 1000;

function matchLine(grammar, line) {
  let cached = matchCache.get(line);
  if (cached === undefined) {
    const m = grammar.match(line);
    cached = m.succeeded() ? m : null;
    if (matchCache.size >= MATCH_CACHE_MAX) matchCache.clear();
    matchCache.set(line, cached);
  }
  return cached;
}

export function evaluate(input) {
  const { grammar, semantics } = getGrammarAndSemantics();
  const state = new State();
  const results = [];

  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();

    if (line === '' || line === '---') {
      results.push(null);
      continue;
    }

    try {
      const match = matchLine(grammar, line);
      if (!match) {
        results.push(null);
        continue;
      }
      const res = semantics(match).eval(state);
      if (res && res.value !== undefined) state.previousResult = res;
      results.push(res);
    } catch {
      results.push(null);
    }
  }

  return results;
}
