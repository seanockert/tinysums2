# Tiny Sums v2

A little text area that lets you calculate stuff with natural language

Based on Ohm.js parser, allows you to set variables and do back of the envelope calculations line by line. Useful for when you don't need something as complex as a spreadsheet.

(Demo here)[https://so-tinysums.surge.sh]

### Example:

days = 15

food: $12 \* days

> $180

transport: $3.50 \* days

> $52.50

sum

> food + transport = $232.50

# Supported and coming features

## Calculations

- +-/\*^
- order of operations
- keywords: times, divided by, plus, minus
- 'sum' or 'total' or '---' all lines since last sum
- allow K and M for 1000 and 1,000,000
- 'round' value eg. 6.55 -> 7
- compound interest eg. $600 at 5% pa

## Variables

- set variable with = or 'is'
- use variables in calculations

## Currency

- set common currency $, € etc.
- parse ISO 4217 codes after number too: AUD, USD etc (5 USD)
- include optional cents (decimal) (http://stackoverflow.com/questions/308122/simple-regular-expression-for-a-decimal-with-a-precision-of-2)

## Percentages

- 'of' keyword (20% of $5)
- 'off' keyword (10% off $30)
- 'on' keyword (50% on $100)

## Dates

- convert keywords 'today', 'now', 'tomorrow', 'yesterday', 'next thursday' to dates
- parse second, minute, hour, day, week, month, year
- eg. today plus 10 days

## Misc

- comment with quote marks "normally $65"

## TODO

- currency conversion
- weights and measures conversion
