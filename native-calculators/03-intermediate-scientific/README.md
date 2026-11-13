# Scientific Calculator — intermediate developer

A real native AppKit calculator face backed by a compiled Arya expression engine. The expression display, keypad, angle selector, memory keys and history are native controls supplied by the collection host. No web server, HTML, browser engine, eval, Node or Python runs the application.

## Calculate

Type an expression or use the keypad, choose Degrees or Radians, and press Enter or `=`. Examples:

| Expression | Result / mode |
| --- | --- |
| `2 + 3 * 4` | 14 |
| `2^3^2` | 512; powers associate right |
| `-2^2` | -4 |
| `(-2)^2` | 4 |
| `2^-2` | 0.25 |
| `sin(30) + sqrt(9)` | 3.5 in Degrees |
| `sin(pi/2)` | 1 in Radians |
| `ln(e) + log(1000)` | 4 |
| `5!` or `fact(5)` | 120 |

Precedence, highest first: parentheses/functions/constants; postfix factorial; power; unary `+`/`-`; `*` `/` `%`; `+` `-`. Power associates right and accepts signed exponents. All other binary operators associate left. Explicit multiplication is required: use `2*pi`, not `2pi`. `%` means remainder, not percentage; its sign follows the left operand. Decimal and scientific notation are supported, including `.5` and `1e-3`.

Functions: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `ln` (natural log), `log` (base 10), `abs`, `exp`, `floor`, `ceil`, `fact`. Function arguments require parentheses. Names are case-insensitive. Constants are `pi` and `e`. Angle mode affects trigonometric input and inverse-trigonometric output. Factorial takes integers 0–170. `0^0` is 1. In degree mode, tangent rejects exact binary64 angles congruent to ±90 modulo 180 before conversion to radians. It also rejects arguments whose absolute computed cosine is below 1e-15.

Arithmetic uses binary64 real numbers, roughly 15–17 significant decimal digits. Results are approximate; this is not exact-decimal accounting or a complex-number calculator. Invalid domains, division/remainder by zero and nonfinite results return an error without changing stored data. Very large trigonometric arguments inherit normal floating-point argument-reduction limits.

Memory stores the current result. M+/M− use the same binary64 rules; MR restores memory into the result and expression. Memory, last result and the most recent 100 calculations survive restarts. Clearing history preserves the last result and memory.

## Build and verify

```sh
make check
make build
python3 smoke.py .build/worker
```

Run from this directory. The shared collection builder creates the `.app`. To inspect the engine directly:

```sh
DATA_FILE=/tmp/scientific-calculator.json .build/worker calculate '{"view":"history","expression":"sin(30)+sqrt(9)","angle":"deg"}'
```

Python is test tooling only. The tests invoke actual native processes and compare results with Python math/reference arithmetic.

## Limits and storage

Input: 512 characters, 256 tokens and 32 parser nesting/recursion levels. History: 100 entries; JSON store: 512 KiB. The host sets an Application Support data file, or `DATA_FILE` can isolate testing. Private temporary files and rename publish complete snapshots. Rejected operations and failed writes preserve the prior file. Malformed storage is reported, never silently reset. One host instance owns a store; direct concurrent engine invocations are not supported. Atomic replacement is not an fsync/power-loss durability guarantee.

See [REPORT.md](REPORT.md) and retained verification evidence for actual work and results.
