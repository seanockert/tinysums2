import { UNIT_SPELLINGS, LOWERCASE_ONLY, TZ_LABELS } from './tables.js';
import { CURRENCY_CODES } from './currency.js';

// Build an ordered alternation of terminals for a lexical rule
function alternation(items, indent = '    ') {
  return items.join(`\n${indent}| `);
}

// Single letters stay case-sensitive; everything else matches any casing
const unitSuffixes = UNIT_SPELLINGS.map(s =>
  LOWERCASE_ONLY.has(s) ? `"${s}" ~alnum` : `caseInsensitive<${JSON.stringify(s)}> ~alnum`
);

const currencyCodes = [...CURRENCY_CODES].map(c => `caseInsensitive<"${c}"> ~alnum`);
const timezones = TZ_LABELS.map(z => `"${z}" ~alnum`);

export const grammarSource = String.raw`
Sumthing {
  Line
    = Comment
    | CompoundInterest
    | RelativeTime
    | TimezoneConversion
    | DateTime
    | Variable
    | PercentQuery
    | Calculation
    | WordsLine

  Calculation
    = Expression inKw aKw? pctWord                   -- inPercent
    | Expression inKw currencyCode                   -- inCurrency
    | Expression toKw currencyCode                   -- toCurrency
    | Expression inKw unitSuffix                     -- conversion
    | Expression toKw unitSuffix                     -- toConversion
    | Expression intoKw unitSuffix                   -- intoConversion
    | Expression asKw aKw? pctWord                   -- asPercent
    | Expression asKw unitSuffix                     -- asConversion
    | howKw manyKw unitSuffix inKw Expression          -- howManyConversion
    | unitSuffix inKw Expression                      -- reverseConversion
    | Expression

  PercentQuery
    = Expression isKw whatKw pctQWord ofKw Expression    -- whatPercentOf
    | Expression isKw Expression ofKw whatKw             -- isPercentOfWhat
    | Expression toKw Expression isKw whatKw pctQWord    -- percentChange
    | Expression isKw Expression offKw whatKw            -- isPercentOffWhat

  whatKw  = "what" ~alnum
  ofKw   = "of" ~alnum
  offKw  = "off" ~alnum
  pctQWord = "%" | "percent" ~alnum

  RelativeTime
    = Expression fromKw nowKw   -- future
    | Expression agoKw          -- past

  agoKw = "ago" ~alnum

  // Left-recursive — ohm handles natively, gives left-associative trees
  Expression
    = Expression addOp Term                         -- add
    | Term

  addOp
    = "+" | "-"
    | "plus" ~alnum | "minus" ~alnum
    | "and" ~alnum | "with" ~alnum | "without" ~alnum

  Term
    = Term mulOp Power                              -- mul
    | Power

  mulOp
    = "*" | "/" | "×" | "÷"
    | "x" ~letter | "times" ~alnum | "divided by" ~alnum | "divided" ~alnum

  Power
    = Factor "^" Power                              -- pow
    | Factor

  Factor
    = "-" Factor                                    -- neg
    | "(" Expression ")"                            -- paren
    | PercentOff
    | PercentOf
    | PercentOn
    | Percent
    | Quantity
    | CurrencyWithCode
    | Currency
    | NumberLit
    | Sum
    | Prev
    | Average
    | Minimum
    | Maximum
    | Count
    | VariableRef

  Percent
    = number "%"

  // --- Aggregation keywords ---
  Sum
    = sumKw
  sumKw = "sum" ~alnum | "total" ~alnum

  Prev
    = prevKw
  prevKw = "prev" ~alnum | "previous" ~alnum

  Average
    = avgKw
  avgKw = "avg" ~alnum | "average" ~alnum

  // "min" is minutes, so aggregation uses the long forms only
  Minimum
    = minKw
  minKw = "minimum" ~alnum | "lowest" ~alnum

  Maximum
    = maxKw
  maxKw = "maximum" ~alnum | "highest" ~alnum

  Count
    = countKw
  countKw = "count" ~alnum

  // --- Variables ---
  Variable
    = varName assignOp Expression

  assignOp
    = "=" | ":" | isKw

  isKw
    = "is" &(" ")

  varName
    = ~reserved nameStart nameRest*

  nameStart = letter | "_"
  nameRest  = alnum | "_"

  VariableRef
    = varName

  // --- Currency ---
  CurrencyWithCode
    = number kSuffix? currencyCode

  Currency
    = currencySymbol number kSuffix?

  currencySymbol
    = "$" | "€" | "£"

  currencyCode
    = ${alternation(currencyCodes)}

  kSuffix
    = "K" | "k"

  // --- Percentages ---
  PercentOff
    = number "%" "off" ~alnum Expression

  PercentOf
    = number "%" "of" ~alnum Expression

  PercentOn
    = number "%" "on" ~alnum Expression

  // --- Compound Interest ---
  CompoundInterest
    = Expression forKw Expression yearWord atKw number "%" compoundingKw? frequencyWord?  -- full
    | Expression atKw number "%" paKw                                                      -- simple

  atKw = "at" ~alnum
  paKw = "pa" ~alnum
  forKw = "for" ~alnum
  yearWord = "years" ~alnum | "year" ~alnum
  compoundingKw = "compounding" ~alnum
  frequencyWord
    = "monthly" ~alnum | "quarterly" ~alnum | "annually" ~alnum
    | "daily" ~alnum | "weekly" ~alnum | "yearly" ~alnum

  // --- From now / conversion / percentage ---
  fromKw  = "from" ~alnum
  nowKw   = "now" ~alnum
  inKw    = "in" ~alnum
  intoKw  = "into" ~alnum
  toKw    = "to" ~alnum
  asKw    = "as" ~alnum
  aKw     = "a" ~alnum
  howKw   = caseInsensitive<"how"> ~alnum
  manyKw  = caseInsensitive<"many"> ~alnum
  pctWord = "percentage" ~alnum | "percent" ~alnum | "%"

  // --- Units ---
  Quantity
    = fracQuantity                                     -- frac
    | number unitSuffix                                -- simple

  // Lexical rule: no implicit whitespace, so 1/8inch binds as one token
  fracQuantity = number "/" number unitSuffix

  NumberLit
    = number kSuffix?

  // --- Timezone Conversion ---
  TimezoneConversion
    = timeLiteral timezone inKw timezone    -- convert
    | dateKw inKw timezone                  -- nowInTz

  timeLiteral
    = number ":" number ampm                -- colonAmPm
    | number ":" number                     -- colon24
    | number ampm                           -- bareAmPm

  ampm = "am" ~alnum | "pm" ~alnum

  timezone
    = ${alternation(timezones)}

  // --- Date/Time ---
  DateTime
    = dateKw
  dateKw = "now" ~alnum | "today" ~alnum

  // --- Comments ---
  Comment
    = lineComment | inlineComment

  lineComment
    = "//" (~"\n" any)*

  inlineComment
    = "\"" (~"\"" ~"\n" any)* "\""?

  // --- Fallback (unrecognized text) ---
  WordsLine
    = wordChar+

  wordChar
    = letter | "_" | "." | "," | "?" | "!" | "'" | "&" | "#"

  // --- Reserved words ---
  reserved
    = ("sum" | "total" | "now" | "today"
      | "prev" | "previous" | "avg" | "average"
      | "minimum" | "maximum" | "lowest" | "highest" | "count"
      | "is" | "x" | "to" | "what") ~alnum
    | currencyCode

  // --- Number primitives ---
  number
    = digit digit? digit? ("," digit digit digit)+ "." digit+   -- commaDecimal
    | digit+ "." digit+                                          -- decimal
    | digit digit? digit? ("," digit digit digit)+               -- commaWhole
    | digit+                                                      -- whole

  // --- Unit suffixes (generated from tables.js, longest spelling first) ---
  unitSuffix
    = ${alternation(unitSuffixes)}
    | "\"" | "'"
}
`;
