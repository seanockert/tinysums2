// TinySums ohm.js grammar definition
// Parses a single line of input at a time

export const grammarSource = String.raw`
TinySums {
  Line
    = Comment
    | CompoundInterest
    | FromNow
    | DateTime
    | Variable
    | Calculation
    | WordsLine

  Calculation
    = Expression inKw unitSuffix                     -- conversion
    | Expression asKw aKw? pctWord                   -- asPercent
    | Expression

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
    = "*" | "/" | "\u00d7"
    | "times" ~alnum | "divided by" ~alnum | "divided" ~alnum

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
  Currency
    = currencySymbol number kSuffix?

  currencySymbol
    = "$" | "\u20ac" | "\u00a3"

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
    = Expression atKw number "%" paKw

  atKw = "at" ~alnum
  paKw = "pa" ~alnum

  // --- From now / conversion / percentage ---
  fromKw  = "from" ~alnum
  nowKw   = "now" ~alnum
  inKw    = "in" ~alnum
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
      | "is") ~alnum

  // --- Number primitives ---
  number
    = digit+ "." digit+                             -- decimal
    | digit+                                        -- whole

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
    | caseInsensitive<"g"> | caseInsensitive<"l"> | caseInsensitive<"b">
    | "m" ~alnum
    | "\"" | "'"
}
`;
