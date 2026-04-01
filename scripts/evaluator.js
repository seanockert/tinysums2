// TinySums evaluator — unit system, state management, ohm semantic actions

import { grammarSource } from './grammar.js';

// ============================================================
// Unit System
// ============================================================

const UNIT_GROUPS = {
  mass:   { mg: 0.001, g: 1, kg: 1000 },
  volume: { ml: 1, l: 1000 },
  length: { mm: 1, cm: 10, m: 1000, km: 1000000, inch: 25.4, ft: 304.8, yd: 914.4, mi: 1609344 },
  data:   { b: 1, kb: 1024, mb: 1048576, gb: 1073741824 },
  time:   { sec: 1, min: 60, hr: 3600, day: 86400, week: 604800 },
  speed:  { kph: 1, mph: 1.60934, mps: 3.6, fps: 1.09728, knot: 1.852 },
};

const UNIT_TO_GROUP = {};
for (const [group, units] of Object.entries(UNIT_GROUPS)) {
  for (const unit of Object.keys(units)) {
    UNIT_TO_GROUP[unit] = group;
  }
}

function normalizeUnit(raw) {
  const u = raw.toLowerCase();
  const aliases = {
    secs: 'sec', mins: 'min', hrs: 'hr', hour: 'hr', hours: 'hr',
    days: 'day', weeks: 'week',
    inches: 'inch', '"': 'inch', "'": 'ft',
    feet: 'ft', foot: 'ft',
    yards: 'yd', yard: 'yd',
    miles: 'mi', mile: 'mi',
    'km/h': 'kph', 'km/hr': 'kph', 'k/hr': 'kph', kmh: 'kph', kmph: 'kph',
    'm/s': 'mps',
    'ft/s': 'fps',
    knots: 'knot',
  };
  return aliases[u] || u;
}

function toBase(value, unit) {
  const u = normalizeUnit(unit);
  const group = UNIT_TO_GROUP[u];
  if (!group) return { value, group: null, unit: u };
  return { value: value * UNIT_GROUPS[group][u], group };
}

function bestUnit(baseValue, group) {
  if (!group || !UNIT_GROUPS[group]) return { value: baseValue, unit: null };
  const units = UNIT_GROUPS[group];
  // Sort units by scale descending
  const sorted = Object.entries(units).sort((a, b) => b[1] - a[1]);
  for (const [unit, scale] of sorted) {
    const display = baseValue / scale;
    if (Math.abs(display) >= 1) {
      return { value: display, unit };
    }
  }
  // Fallback: smallest unit
  const smallest = sorted[sorted.length - 1];
  return { value: baseValue / smallest[1], unit: smallest[0] };
}

// ============================================================
// Result helpers
// ============================================================

function result(value, prefix = '', unit = null, unitGroup = null) {
  return { value, prefix, unit, unitGroup };
}

function mergeUnits(a, b) {
  // If both have units in the same group, arithmetic in base units
  if (a.unitGroup && b.unitGroup && a.unitGroup === b.unitGroup) {
    return { unitGroup: a.unitGroup, aBase: toBase(a.value, a.unit).value, bBase: toBase(b.value, b.unit).value };
  }
  // If only one has units, the result keeps those units
  if (a.unitGroup && !b.unitGroup) {
    return { unitGroup: a.unitGroup, aBase: toBase(a.value, a.unit).value, bBase: b.value * UNIT_GROUPS[a.unitGroup][a.unit] };
  }
  if (!a.unitGroup && b.unitGroup) {
    return { unitGroup: b.unitGroup, aBase: a.value * UNIT_GROUPS[b.unitGroup][b.unit], bBase: toBase(b.value, b.unit).value };
  }
  return null;
}

function addResults(a, b) {
  const prefix = a.prefix || b.prefix;
  const merged = mergeUnits(a, b);
  if (merged) {
    const baseVal = merged.aBase + merged.bBase;
    const best = bestUnit(baseVal, merged.unitGroup);
    return result(best.value, prefix, best.unit, merged.unitGroup);
  }
  return result(a.value + b.value, prefix);
}

function subtractResults(a, b) {
  const prefix = a.prefix || b.prefix;
  const merged = mergeUnits(a, b);
  if (merged) {
    const baseVal = merged.aBase - merged.bBase;
    const best = bestUnit(baseVal, merged.unitGroup);
    return result(best.value, prefix, best.unit, merged.unitGroup);
  }
  return result(a.value - b.value, prefix);
}

function multiplyResults(a, b) {
  const prefix = a.prefix || b.prefix;
  const unit = a.unit || b.unit;
  const unitGroup = a.unitGroup || b.unitGroup;
  // For multiplication, one side should be unitless
  if (a.unitGroup && b.unitGroup) {
    // Both have units — multiply raw values, keep first unit
    return result(a.value * b.value, prefix, a.unit, a.unitGroup);
  }
  return result(a.value * b.value, prefix, unit, unitGroup);
}

function divideResults(a, b) {
  const prefix = a.prefix || b.prefix;
  if (b.value === 0) return result(0, prefix);
  // Division with same unit group = unitless ratio
  if (a.unitGroup && b.unitGroup && a.unitGroup === b.unitGroup) {
    const merged = mergeUnits(a, b);
    return result(merged.aBase / merged.bBase, prefix);
  }
  return result(a.value / b.value, prefix, a.unit, a.unitGroup);
}

// ============================================================
// Evaluation State
// ============================================================

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
    return result(v.value, v.prefix, v.unit, v.unitGroup);
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

// ============================================================
// Compound interest
// ============================================================

function compound(principal, annualRate, years, frequency) {
  if (!frequency) frequency = 12;
  const r = annualRate / 100;
  let accumulated = principal;
  for (let i = 0; i < years * frequency; i++) {
    accumulated += (r / frequency) * accumulated;
  }
  return accumulated;
}

// ============================================================
// Build grammar + semantics
// ============================================================

let _grammar = null;
let _semantics = null;

export function getGrammarAndSemantics() {
  if (_grammar) return { grammar: _grammar, semantics: _semantics };

  _grammar = ohm.grammar(grammarSource);
  _semantics = _grammar.createSemantics().addOperation('eval(state)', {

    Line(node) { return node.eval(this.args.state); },

    Calculation_conversion(expr, _inKw, targetUnit) {
      const s = this.args.state;
      const val = expr.eval(s);
      const target = normalizeUnit(targetUnit.sourceString);
      const group = UNIT_TO_GROUP[target];
      if (group && val.unitGroup === group) {
        const baseVal = toBase(val.value, val.unit).value;
        const converted = baseVal / UNIT_GROUPS[group][target];
        return result(converted, val.prefix, target, group);
      }
      return val;
    },
    Calculation_asPercent(expr, _asKw, _aKw, _pctWord) {
      const val = expr.eval(this.args.state);
      return result(val.value * 100, '', '%', null);
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

    // --- Arithmetic ---
    Expression_add(left, op, right) {
      const s = this.args.state;
      const l = left.eval(s);
      const r = right.eval(s);
      const opStr = op.sourceString.trim();
      if (opStr === '-' || opStr === 'minus' || opStr === 'without') {
        return subtractResults(l, r);
      }
      return addResults(l, r);
    },
    Expression(node) { return node.eval(this.args.state); },

    Term_mul(left, op, right) {
      const s = this.args.state;
      const l = left.eval(s);
      const r = right.eval(s);
      const opStr = op.sourceString.trim();
      if (opStr === '/' || opStr === 'divided by' || opStr === 'divided') {
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
    Currency(symbol, num, kSuffix) {
      let val = parseFloat(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      return result(val, symbol.sourceString);
    },

    // --- Numbers ---
    NumberLit(num, kSuffix) {
      let val = parseFloat(num.sourceString);
      if (kSuffix.sourceString) val *= 1000;
      return result(val);
    },

    number_decimal(_int, _dot, _frac) {
      return result(parseFloat(this.sourceString));
    },
    number_whole(_digits) {
      return result(parseFloat(this.sourceString));
    },

    // --- Quantities (units) ---
    Quantity_frac(fq) {
      return fq.eval(this.args.state);
    },
    Quantity_simple(num, suffix) {
      const raw = parseFloat(num.sourceString);
      const unit = normalizeUnit(suffix.sourceString);
      const group = UNIT_TO_GROUP[unit];
      return result(raw, '', unit, group || null);
    },

    fracQuantity(num1, _slash, num2, suffix) {
      const raw = parseFloat(num1.sourceString) / parseFloat(num2.sourceString);
      const unit = normalizeUnit(suffix.sourceString);
      const group = UNIT_TO_GROUP[unit];
      return result(raw, '', unit, group || null);
    },

    // --- Percentages ---
    PercentOf(num, _pct, _of, expr) {
      const p = parseFloat(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(p / 100 * val.value, val.prefix, val.unit, val.unitGroup);
    },

    PercentOff(num, _pct, _off, expr) {
      const p = parseFloat(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(val.value - (p / 100 * val.value), val.prefix, val.unit, val.unitGroup);
    },

    PercentOn(num, _pct, _on, expr) {
      const p = parseFloat(num.sourceString);
      const val = expr.eval(this.args.state);
      return result(val.value + (p / 100 * val.value), val.prefix, val.unit, val.unitGroup);
    },

    // --- Compound Interest ---
    CompoundInterest(expr, _atKw, rate, _pct, _paKw) {
      const val = expr.eval(this.args.state);
      const r = parseFloat(rate.sourceString);
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
    kSuffix(_) { return null; },
    unitSuffix(_) { return null; },
    sumKw(_) { return null; },
    prevKw(_) { return null; },
    avgKw(_) { return null; },
    dateKw(_) { return null; },
    atKw(_) { return null; },
    paKw(_) { return null; },
    fromKw(_) { return null; },
    nowKw(_) { return null; },
    inKw(_) { return null; },
    asKw(_) { return null; },
    aKw(_) { return null; },
    pctWord(_) { return null; },
    reserved(_) { return null; },
    nameStart(_) { return null; },
    nameRest(_) { return null; },
    wordChar(_) { return null; },

    _terminal() { return null; },
    _iter(...children) { return children.map(c => c.eval(this.args.state)); },
  });

  return { grammar: _grammar, semantics: _semantics };
}

// ============================================================
// Main evaluation function — processes all lines
// ============================================================

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
