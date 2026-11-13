# Precision Calculator

A native AppKit rational calculator with a real keypad/display, exact result, selectable decimal preview, memory and persistent history. Its Arya engine implements an explicit expression parser and reduced fractions using arbitrary-precision decimal-string integer arithmetic.

## Build and open

From the repository root:

```sh
python3 native-calculators/build.py --filter 06-world-class-precision
open "native-calculators/dist/Precision Calculator.app"
```

See the [collection guide](../README.md). Python is build/test tooling only; the completed application runs native executables without a browser, HTTP server or script evaluator.

## Exact calculations

Enter an expression and press Enter or `=`:

| Expression | Exact result |
| --- | --- |
| `1/3 + 1/6` | `(1/2)` |
| `0.1 + 0.2` | `(3/10)` |
| `(2/3)^2` | `(4/9)` |
| `2^-3` | `(1/8)` |
| `2^3^2` | `512` |
| `-2^2` | `-4` |
| `(-2)^2` | `4` |
| `9007199254740993 + 1` | `9007199254740994` |
| `(10^100-1)/(10^100-1)` | `1` |

Fractions are reduced and denominators are positive. Noninteger results include parentheses deliberately: continuing `(2/3)` with `^2` squares the whole fraction. Decimal literals are exact fractions, so there is no binary-floating-point conversion. Memory operations also retain exact fractions.

The grammar supports decimal literals, parentheses, unary signs, `+ - * /`, right-associative integer powers `^`, postfix `%`, and `abs()`. Power binds before unary minus. Percent always divides the preceding value by 100; `200+10%` means `200.1`. Multiplication must be explicit. Integer exponents from −100 to 100 are supported; fractional exponents and `0^0` are rejected.

This is a bounded exact rational calculator. It does not provide symbolic variables, algebraic simplification involving unknowns, irrational roots, transcendental functions or scientific exponent notation. Unsupported input receives a clear error.

## Decimal preview and memory

**Places** selects the decimal preview precision; **Rounding** selects Half even, Half up, Toward zero, Floor or Ceiling. The exact primary result remains unchanged. Preview precision accepts 0–50 places through the engine, with common presets in the native selector. Half up rounds ties away from zero; Floor/Ceiling mean toward negative/positive infinity. For `-1/8` at two places, Half even previews `-0.12`, while Half up and Floor preview `-0.13`.

MS stores the current exact value. M+ and M− perform exact fraction arithmetic; MR recalls memory into the result/expression; MC resets it. Each operation works across a newly launched native worker process. History retains the latest 100 calculations; clearing it preserves the last result and memory. Use the native history search, CSV export and bundled guide to review work.

## Bounds and persistence

Input is limited to 2048 characters, 256 tokens and parser nesting depth 32. Numeric literals allow at most 600 characters before normalization; each reduced numerator and denominator is capped at 300 digits. Each operation is exact within these limits; if an intermediate reduced value grows beyond them, the calculation fails without changing state. A 20,000-step arithmetic budget bounds GCD/reduction work. This is arbitrary-precision integer arithmetic within explicit resource limits, not an unlimited-memory promise.

`std decimal` provides integer addition/multiplication and integer quotient via zero-place division toward zero. Remainders are constructed exactly as `a - quotient*b`, enabling Euclidean GCD without a native modulo API. Cross-cancellation reduces multiplication growth; addition uses the denominator GCD. Finite integer operations stay within the native library's 1024-character input/output ceiling. Decimal preview is a separate, explicitly rounded operation.

State lives at `~/Library/Application Support/Arya Native/calc-precision/data.json`, with `DATA_FILE` available for isolated tests. The engine validates stored canonical fractions and history rows, then writes inside a private sibling staging directory and renames the completed file. Both existing and dangling store symlinks are rejected; predictable legacy `.tmp` paths are ignored. Corrupt state is rejected visibly rather than reset; unsuccessful calculations and writes preserve existing bytes. The native host allows one instance per store. The file is capped at 1 MiB; atomic replacement does not claim fsync-level power-loss durability.

## Verification

```sh
./bin/arya check native-calculators/06-world-class-precision/main.arya
./bin/arya build native-calculators/06-world-class-precision/main.arya -o native-calculators/06-world-class-precision/.build/worker --release --force
python3 native-calculators/06-world-class-precision/smoke.py native-calculators/06-world-class-precision/.build/worker
```

`rational.arya` is a local imported module embedded in the native executable. Independent Python Fraction/Decimal test oracles check fixed and seeded random expressions, 50-place previews, negative rounding ties, exact large integers, continuation of returned fractions, errors/resource limits, memory, restart, corrupt state, store/temporary-path symlink regressions and actual failed-write rollback. Python is test tooling only. [REPORT.md](REPORT.md) records actual work and issues; native-window and final bundle checks are recorded in the collection evidence.
