# Tiny Sums v2

A little text area that lets you calculate stuff with natural language.

Based on an Ohm.js parser, allows you to set variables and do back of the envelope calculations line by line. Useful for when you don't need something as complex as a spreadsheet.

[Demo here](https://tinysums.seanockert.com)

### Example

```
days = 15

food: $12 * days          // $180
transport: $3.50 * days   // $52.50

sum                        // $232.50
```

---

## Arithmetic

Standard math with natural language alternatives.

```
5 + 3
10 minus 5
5 * 3          // or 5 × 3, 5 x 3, 5 times 3
20 / 4         // or 20 ÷ 4, divided by, divided
2 ^ 10
(5 + 3) * 2
100 and 50     // addition
100 without 10 // subtraction
```

## Numbers

```
100
3.14
1,000,000      // comma-separated
1,250.75       // commas with decimals
50K            // 50,000 (K suffix)
$100K          // $100,000
```

## Currency

Supports `$`, `€`, and `£` symbol prefixes, plus currency codes.

```
$100 + $50
€200 * 3
£500 - 10%
$50K + $25K
100 USD + 50 EUR
1000 JPY
```

### Currency conversion

Convert between 20 supported currencies using live exchange rates.

```
50 USD in EUR
$100 to GBP
1000 JPY in AUD
€500 as CAD
```

**Supported currencies:** USD, EUR, GBP, AUD, CAD, NZD, JPY, CHF, CNY, INR, SGD, HKD, KRW, SEK, NOK, DKK, BRL, ZAR, MXN, THB

## Percentages

```
20% of $500          // $100
10% off $30          // $27
50% on $100          // $150
100 + 20%            // 120 (adds 20%)
100 - 20%            // 80 (subtracts 20%)
```

### Percentage queries

```
50 is what % of 200         // 25%
50 is 25% of what           // 200
100 to 150 is what %        // 50%
30 is 25% off what          // 40
```

### Convert to percentage

```
0.75 as a percentage        // 75%
0.5 in a percent            // 50%
```

## Variables

Use `:` or `is` to assign a variable (adds to the running sum). Use `=` for constants (not included in the sum).

```
days = 15
food: $12 * days
transport: $3.50 * days
```

### Aggregation

```
sum        // or total — sums all : variables since last sum
avg        // or average
prev + 5   // previous result
```

## Unit conversions

Convert between units with `in`, `to`, `into`, or `as`.

```
5km in m
10 feet to yards
100f to c
5km as miles
2l into ml
```

### Supported units

| Category    | Units                                                            |
| ----------- | ---------------------------------------------------------------- |
| Length      | mm, cm, m, km, inch/inches ("), feet/ft ('), yard/yd, mile/mi   |
| Mass        | mg, g/grams, kg                                                  |
| Volume      | tsp, tbsp, floz, cup, pint/pt, quart/qt, l, gallon/gal, ml     |
| Data        | b, kb, mb, gb                                                    |
| Time        | sec/secs, min/mins, hr/hrs, day/days, week/weeks                 |
| Speed       | kph (km/h, kmh, kmph), mph, mps (m/s), fps (ft/s), knot/knots  |
| Temperature | celsius/c, fahrenheit/f, kelvin/k                                |

Volume and mass units can be cross-converted using water density (1 ml = 1 g):

```
2 cups in ml
1 gallon in l
1.5tbsp in grams
100g in ml
```

### Fractional units

```
1/2 inch + 1/4 inch
3/4 ft
```

### Cross-unit arithmetic

```
60kph * 2hr       // 120 km (speed x time = distance)
120km / 60kph     // 2 hours (distance / speed = time)
```

## Compound interest

```
$600 at 5% pa                              // 1 year, monthly compounding
$1000 for 5 years at 3% monthly
$600 for 10 years at 5% compounding quarterly
```

Frequencies: `monthly`, `quarterly`, `annually`, `yearly`, `daily`, `weekly`

## Timezone conversion

Convert times between 30+ timezones.

```
15:30 GMT in AEST
now in PST
3:30pm EST in UTC
8am GMT in JST
```

**Supported timezones:** UTC, GMT, BST, CET, CEST, EET, EEST, EST, EDT, CST, CDT, MST, MDT, PST, PDT, AKST, AKDT, HST, AEST, AEDT, ACST, AWST, NZST, NZDT, JST, KST, IST

## Dates and time

```
today                  // current date
now                    // current date and time
5 days from now
2 hours from now
days in 2025           // 365
weeks in 2024          // 52.14 (accounts for leap years)
```

## Comments

```
// This is a comment
"normal price $65"     // quoted text is treated as a comment
---                    // separator line
```
