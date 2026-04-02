// TinySums ohm.js grammar definition
// Parses a single line of input at a time

export const grammarSource = String.raw`
TinySums {
  Line
    = Comment
    | CompoundInterest
    | FromNow
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

  FromNow
    = Expression fromKw nowKw

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
    = "*" | "/" | "\u00d7" | "\u00f7"
    | "x" ~letter | "times" ~alnum | "divided by" ~alnum | "divided" ~alnum

  Power
    = Factor "^" Power                              -- pow
    | Factor

  Factor
    = "(" Expression ")"                            -- paren
    | PercentOff
    | PercentOf
    | PercentOn
    | Percent
    | TimeInYear
    | Quantity
    | CurrencyWithCode
    | Currency
    | NumberLit
    | Sum
    | Prev
    | Average
    | VariableRef

  Percent
    = number "%"

  TimeInYear
    = timeUnitWord inKw number

  timeUnitWord
    = "weeks" ~alnum | "week" ~alnum
    | "months" ~alnum | "month" ~alnum
    | "days" ~alnum | "day" ~alnum
    | "hours" ~alnum | "hour" ~alnum
    | "minutes" ~alnum | "minute" ~alnum
    | "seconds" ~alnum | "second" ~alnum

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
    = "$" | "\u20ac" | "\u00a3"

  currencyCode
    = caseInsensitive<"usd"> ~alnum | caseInsensitive<"eur"> ~alnum | caseInsensitive<"gbp"> ~alnum
    | caseInsensitive<"aud"> ~alnum | caseInsensitive<"cad"> ~alnum | caseInsensitive<"nzd"> ~alnum
    | caseInsensitive<"jpy"> ~alnum | caseInsensitive<"chf"> ~alnum | caseInsensitive<"cny"> ~alnum
    | caseInsensitive<"inr"> ~alnum | caseInsensitive<"sgd"> ~alnum | caseInsensitive<"hkd"> ~alnum
    | caseInsensitive<"krw"> ~alnum | caseInsensitive<"sek"> ~alnum | caseInsensitive<"nok"> ~alnum
    | caseInsensitive<"dkk"> ~alnum | caseInsensitive<"brl"> ~alnum | caseInsensitive<"zar"> ~alnum
    | caseInsensitive<"mxn"> ~alnum | caseInsensitive<"thb"> ~alnum

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
    = "AEST" ~alnum | "AEDT" ~alnum | "ACST" ~alnum | "AWST" ~alnum
    | "NZST" ~alnum | "NZDT" ~alnum
    | "JST" ~alnum | "KST" ~alnum | "IST" ~alnum
    | "CET" ~alnum | "CEST" ~alnum | "EET" ~alnum | "EEST" ~alnum
    | "GMT" ~alnum | "UTC" ~alnum | "BST" ~alnum
    | "EST" ~alnum | "EDT" ~alnum
    | "CST" ~alnum | "CDT" ~alnum
    | "MST" ~alnum | "MDT" ~alnum
    | "PST" ~alnum | "PDT" ~alnum
    | "AKST" ~alnum | "AKDT" ~alnum | "HST" ~alnum

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
      | "is" | "x" | "to" | "what") ~alnum
    | currencyCode

  // --- Number primitives ---
  number
    = digit digit? digit? ("," digit digit digit)+ "." digit+   -- commaDecimal
    | digit+ "." digit+                                          -- decimal
    | digit digit? digit? ("," digit digit digit)+               -- commaWhole
    | digit+                                                      -- whole

  // --- Unit suffixes (order matters: longer first) ---
  // Case-insensitive multi-char units use caseInsensitive<>
  // "m" (meters) is lowercase-only to avoid conflict with M multiplier
  unitSuffix
    = caseInsensitive<"kmph"> ~alnum | caseInsensitive<"km/hr"> ~alnum
    | caseInsensitive<"km/h"> ~alnum | caseInsensitive<"kph"> ~alnum | caseInsensitive<"kmh"> ~alnum
    | caseInsensitive<"k/hr"> ~alnum
    | caseInsensitive<"mph"> ~alnum
    | caseInsensitive<"m/s"> ~alnum | caseInsensitive<"mps"> ~alnum
    | caseInsensitive<"ft/s"> ~alnum | caseInsensitive<"fps"> ~alnum
    | caseInsensitive<"knots"> ~alnum | caseInsensitive<"knot"> ~alnum
    | caseInsensitive<"tablespoons"> ~alnum | caseInsensitive<"tablespoon"> ~alnum | caseInsensitive<"tbsp"> ~alnum
    | caseInsensitive<"teaspoons"> ~alnum | caseInsensitive<"teaspoon"> ~alnum | caseInsensitive<"tsp"> ~alnum
    | caseInsensitive<"cups"> ~alnum | caseInsensitive<"cup"> ~alnum
    | caseInsensitive<"fluid oz"> ~alnum | caseInsensitive<"fl oz"> ~alnum | caseInsensitive<"floz"> ~alnum
    | caseInsensitive<"gallons"> ~alnum | caseInsensitive<"gallon"> ~alnum | caseInsensitive<"gal"> ~alnum
    | caseInsensitive<"quarts"> ~alnum | caseInsensitive<"quart"> ~alnum | caseInsensitive<"qt"> ~alnum
    | caseInsensitive<"pints"> ~alnum | caseInsensitive<"pint"> ~alnum | caseInsensitive<"pt"> ~alnum
    | caseInsensitive<"grams"> ~alnum | caseInsensitive<"gram"> ~alnum
    | caseInsensitive<"kg"> | caseInsensitive<"mg">
    | caseInsensitive<"km"> | caseInsensitive<"cm"> | caseInsensitive<"mm">
    | caseInsensitive<"ml"> | caseInsensitive<"kb"> | caseInsensitive<"mb"> | caseInsensitive<"gb">
    | caseInsensitive<"inches"> ~alnum | caseInsensitive<"inch"> ~alnum
    | caseInsensitive<"feet"> ~alnum | caseInsensitive<"foot"> ~alnum | caseInsensitive<"ft">
    | caseInsensitive<"yards"> ~alnum | caseInsensitive<"yard"> ~alnum | caseInsensitive<"yd"> ~alnum
    | caseInsensitive<"miles"> ~alnum | caseInsensitive<"mile"> ~alnum | caseInsensitive<"mi"> ~alnum
    | caseInsensitive<"weeks"> ~alnum | caseInsensitive<"week"> ~alnum
    | caseInsensitive<"hours"> ~alnum | caseInsensitive<"hour"> ~alnum
    | caseInsensitive<"days"> ~alnum | caseInsensitive<"day"> ~alnum
    | caseInsensitive<"mins"> ~alnum | caseInsensitive<"min"> ~alnum
    | caseInsensitive<"secs"> ~alnum | caseInsensitive<"sec"> ~alnum
    | caseInsensitive<"hrs"> ~alnum | caseInsensitive<"hr"> ~alnum
    | caseInsensitive<"celsius"> ~alnum | caseInsensitive<"fahrenheit"> ~alnum | caseInsensitive<"kelvin"> ~alnum
    | caseInsensitive<"g"> | caseInsensitive<"l"> | caseInsensitive<"b">
    | "m" ~alnum | "f" ~alnum | "c" ~alnum
    | "\"" | "'"
}
`;
