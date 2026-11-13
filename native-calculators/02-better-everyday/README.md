# Everyday Calculator

A real native macOS calculator: AppKit supplies the expression display, result, keypad and history table; the standalone Arya engine parses expressions, performs arithmetic and saves state. There is no browser, HTML, HTTP server, WebKit, Node or Python application runtime.

## Calculate

Everyday Calculator supports normal precedence, parentheses, unary `+`/`-`, percentages, square roots, squares and persistent memory. Type into the native expression display or insert tokens with the keypad, then press Enter or **=**.

Examples:

| Input | Result |
| --- | --- |
| `2+3*4` | `14` |
| `(2+3)*4` | `20` |
| `20/5/2` | `2` |
| `-2*-3` | `6` |
| `sqrt(81)+square(3)` | `18` |
| `square(-4)` | `16` |
| `200*15%` | `30` |
| `200*(1+15%)` | `230` |
| `200+10%` | `200.1` |

Multiplication/division bind before addition/subtraction, and both groups associate left to right. Percent is a postfix operation that **always divides its own value by 100**; it is not a contextual retail-calculator percentage. Functions are lowercase `sqrt(expression)` and `square(expression)`. Use explicit `*`: `2(3+4)` is rejected. Repeated percent signs, unknown functions, invalid syntax and square roots of negative values produce a useful error.

**MS** stores the current result, **M+** adds it to memory, **M−** subtracts it, **MR** recalls memory into the current result/expression, and **MC** clears memory. Memory and the current result survive restarting the application. Memory operations do not add calculation-history entries. Clearing history keeps the current result and memory.

The native host also provides a searchable history table, selected-entry details, CSV export, a confirmed **Clear history…** action, reveal-data-folder, this guide and normal copy/paste/quit shortcuts. Clear edits the display; Clear history removes the saved history. Successful calculations refresh the result and history immediately.

## Numerical semantics

Numbers use IEEE 754 binary64 arithmetic, with roughly 15–17 significant decimal digits. Results are displayed using Arya's native number-to-string conversion; no decimal rounding policy or exact-money guarantee is imposed. For example, `0.1+0.2` may display `0.30000000000000004`. Integers above 2^53 can lose precision, and very small values may underflow to zero. Decimal scientific notation such as `1e-3` is accepted. Division by zero, overflow to infinity, NaN and nonfinite inputs are rejected without changing saved state.

1024 characters, 256 lexical tokens and at most 32 nested unary/parenthesis/function levels. History keeps the newest 100 calculations and persisted JSON is capped at 256 KiB. Input is parsed by explicit Arya code; supplied text is never executed as code.

## Build and run

From the repository root, build, test and package the native application:

```sh
python3 native-calculators/build.py --filter 02-better-everyday
open 'native-calculators/dist/Everyday Calculator.app'
```

The package requires the local native Arya SDK, C compiler and macOS AppKit frameworks. Python is build/test tooling only. The resulting `.app` contains the native host and worker and runs without Python, Node, the compiler or SDK.

To check just the worker, from this project directory:

```sh
../../bin/arya check main.arya
mkdir -p .build
../../bin/arya build main.arya -o .build/worker --release --force
python3 smoke.py .build/worker
DATA_FILE=/tmp/calc-everyday-inspection.json .build/worker calculate '{"view":"history","expression":"12+7"}'
```

## Persistence and protocol

The native host uses `~/Library/Application Support/Arya Native/calc-everyday/data.json`; `DATA_FILE` can override the file for isolated tests. Its parent directory must exist. The standalone worker defaults to `data.json` in its current directory. Run a single writer per store; the native host provides its data-file lock.

The worker receives `COMMAND JSON_OBJECT` and prints one JSON line. Required commands are `list`, `calculate` and `clear-history`; requests use `view:"history"`. Successful replies contain `ok`, `message`, `result`, `memory`, newest-first flat `rows` and `summary`. Expected errors return `ok:false` with an explanation and exit status 0. `list` does not create an empty file.

Memory commands are `memory-store`, `memory-add`, `memory-subtract` (with `value` as a decimal string), `memory-recall` and `memory-clear`.

Stores are checked before use. Invalid/corrupt data fails visibly and is never silently reset. Validated changes use a private, uniquely named sibling staging directory, write its data file, rename that file over the store, and clean up the staging directory. An existing predictable `.tmp` path is never used. Existing and dangling `DATA_FILE` symlinks are rejected and preserved. Invalid expressions and failed writes preserve the previous file. Atomic rename is not a power-loss/fsync guarantee; keep a backup if history matters.

## Verification

`smoke.py` exercises the actual compiled native worker in fresh processes and temporary storage. Explicit precedence/function/percent examples and randomized expression trees are compared with independent Python arithmetic and `math` results. The test generator never uses `eval` or the production parser. Memory arithmetic, recall, overflow and failed memory writes are also exercised. The suite verifies invalid-input preservation, last-result persistence, the 100-entry limit, history clearing, corrupt data, rejected data-file symlinks, stale temporary-path symlink preservation and failed-write rollback. Permission-failure tests run as an ordinary desktop user, not an unrestricted root account. **107 worker calls passed** in the recorded development run. Root reports separately verify final AppKit bundles and GUI behavior.

See [REPORT.md](REPORT.md) for the actual work record.
