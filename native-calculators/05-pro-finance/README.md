# Finance Calculator

A native AppKit calculator face with an editable expression display, keypad, selectable result, explicit decimal places/rounding, memory and persistent history. Arya performs all calculations. Three native worksheets calculate monthly loan payments, monthly compound growth and discounted prices.

## Build and open

From the repository root:

```sh
python3 native-calculators/build.py --filter 05-pro-finance
open "native-calculators/dist/Finance Calculator.app"
```

See the [collection guide](../README.md). Python is build/test tooling only. The installed app launches a native Arya executable; it uses no browser, HTTP server or scripting evaluator.

## Expressions and rounding

Enter an expression and press Enter or `=`. Choose **Places** and **Rounding** before calculating. Examples at two places, Half even:

| Expression | Result |
| --- | --- |
| `19.95 * 3 + 2.50` | `62.35` |
| `0.1 + 0.2` | `0.30` |
| `1/3 * 3` | `1.00` |
| `-2^2` | `-4.00` |
| `(-2)^2` | `4.00` |
| `2^-3` | `0.12` |
| `200 * 10%` | `20.00` |
| `abs(-15.75)` | `15.75` |

The parser supports decimal literals, parentheses, unary signs, `+ - * /`, right-associative integer powers `^`, postfix percent and `abs()`. Powers bind before unary minus. Percent always divides its preceding value by 100: `200 + 10%` means `200.1`, not a ten-percent increase. Use `200 * (1 + 10%)` for an increase. Multiplication must be explicit. Scientific notation, currency symbols, commas, variables and transcendental functions are not accepted.

Expression arithmetic uses reduced integer fractions internally, implemented with arbitrary-precision decimal-string integer operations. It rounds only the final result. Half even chooses the even last digit on a tie; Half up rounds ties away from zero; Toward zero truncates; Floor rounds toward negative infinity; Ceiling rounds toward positive infinity. API precision is 0–50 decimal places; the native selector offers common presets. At two places `-1/8` is `-0.12` with Half even and `-0.13` with Half up or Floor.

Continuing from a displayed result uses that displayed, rounded decimal. Thus evaluating `1/3` and continuing with `*3` uses `0.33*3`, whereas entering the complete expression `1/3*3` produces `1.00`.

## Finance worksheets

- **Loan payment:** positive principal, annual percentage rate 0–100, and 1–600 monthly payments. Uses `P*r*(1+r)^n / ((1+r)^n-1)` with monthly rate `r = APR/1200`; at zero rate it uses `P/n`. For 100000 at 6% over 360 months, the payment is `599.55` at two places. Details include total and interest computed from the unrounded payment. This is an equal-payment estimate without fees, date conventions or a cent-adjusted final-payment schedule.
- **Compound growth:** positive initial principal, annual rate 0–100 and 1–1200 months. Uses `P*(1+APR/1200)^months`; no additional contributions or fees. 1000 at 6% for 120 months produces `1819.40`.
- **Discount price:** nonnegative original price and discount 0–100%. A 15% discount on 19.95 gives `16.96`; details also show the saving.

Principal/price inputs allow up to 30 integer and 12 fractional digits. Loan and compound worksheets use 200-place integer fixed-point lower/upper bounds, with directed Floor/Ceiling rescaling. A rounded result is emitted only when both bounds round identically; totals, interest and growth are checked the same way. Exact zero-rate and single-period formulas avoid avoidable tie errors. If bounds straddle a rounding boundary, the engine tries exact rational arithmetic within the existing 300-digit and exponent-100 limits. If that fallback cannot certify the requested rounding, it reports a precision-limit error without saving a result; reduce precision or simplify the inputs. The loan cash-flow model remains an estimate because fees and final-payment adjustments are excluded. Discount arithmetic is exact before final rounding. Worksheet history rows contain readable labels; **Use selected** inserts their numeric result. Other history rows can restore the original expression.

## Memory, history and data

MS stores the current result; M+ and M− update memory using the selected decimal rounding; MR recalls it into the display/expression; MC resets memory. Memory arithmetic uses the exact entered decimal value and rounds once. History retains the latest 100 calculations. Clearing history preserves the current result and memory. The native application supports history search, CSV export and a bundled guide.

State lives at `~/Library/Application Support/Arya Native/calc-finance/data.json`; `DATA_FILE` overrides it for tests. Each command loads and validates state, then writes inside a freshly created private sibling staging directory and renames the completed file before success. Existing and dangling store symlinks are rejected using filesystem metadata; a legacy `.tmp` symlink is never followed. Corrupt state and failed writes produce visible errors without resetting data. The native host permits one instance per store. Atomic replacement does not claim fsync-level protection against power loss.

Expression limits: 2048 characters, 256 tokens, parser nesting depth 32, integer exponents −100…100, 600 characters per numeric literal, reduced numerator/denominator at most 300 digits and a 20,000-step arithmetic budget. Intermediate results exceeding these bounds fail rather than silently lose precision. `0^0` is rejected. The store is capped at 1 MiB.

## Verification

```sh
./bin/arya check native-calculators/05-pro-finance/main.arya
./bin/arya build native-calculators/05-pro-finance/main.arya -o native-calculators/05-pro-finance/.build/worker --release --force
python3 native-calculators/05-pro-finance/smoke.py native-calculators/05-pro-finance/.build/worker
```

`rational.arya` is a local imported source module and is embedded into the executable. Tests compare expression results with Python's independent Fraction/Decimal arithmetic, check known worksheet results and 300-digit worksheet references, maximum-magnitude 50-place calculations and exact half-cent ties, and exercise memory, retained history, corruption, store/temporary-path symlink regressions and actual failed-write rollback across separate native processes. Python is never used by the calculator at runtime. See [REPORT.md](REPORT.md) and root packaging evidence for actual results and native GUI checks.
