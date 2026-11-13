# Pocket Calculator

A real native macOS calculator: AppKit supplies the expression display, result, keypad and history table; the standalone Arya engine parses expressions, performs arithmetic and saves state. There is no browser, HTML, HTTP server, WebKit, Node or Python application runtime.

## Calculate

Pocket Calculator does one thing clearly: calculate a number or one arithmetic operation between two signed numbers. Use `+`, `-`, `*` and `/` with the native keypad or keyboard. Press Enter or **=** to calculate; Clear and Backspace edit the display.

Examples:

| Input | Result |
| --- | --- |
| `12 + 7` | `19` |
| `-12.5 * 4` | `-50` |
| `4 / -2` | `-2` |
| `.5 + .25` | `0.75` |
| `1--2` | `3` |
| `12.` | `12` |
| `1e3 / 4` | `250` |

A plain signed number is valid. Parentheses, percentages, functions and multiple-operation chains are deliberately rejected with an explanation. For example, `1+2+3` is not silently evaluated left to right. Memory keys are not part of this simple calculator.

The native host also provides a searchable history table, selected-entry details, CSV export, a confirmed **Clear history…** action, reveal-data-folder, this guide and normal copy/paste/quit shortcuts. Clear edits the display; Clear history removes the saved history. Successful calculations refresh the result and history immediately.

## Numerical semantics

Numbers use IEEE 754 binary64 arithmetic, with roughly 15–17 significant decimal digits. Results are displayed using Arya's native number-to-string conversion; no decimal rounding policy or exact-money guarantee is imposed. For example, `0.1+0.2` may display `0.30000000000000004`. Integers above 2^53 can lose precision, and very small values may underflow to zero. Decimal scientific notation such as `1e-3` is accepted. Division by zero, overflow to infinity, NaN and nonfinite inputs are rejected without changing saved state.

256 characters and 8 lexical tokens; one operation at most. History keeps the newest 100 calculations and persisted JSON is capped at 256 KiB. Input is parsed by explicit Arya code; supplied text is never executed as code.

## Build and run

From the repository root, build, test and package the native application:

```sh
python3 native-calculators/build.py --filter 01-beginner-basic
open 'native-calculators/dist/Pocket Calculator.app'
```

The package requires the local native Arya SDK, C compiler and macOS AppKit frameworks. Python is build/test tooling only. The resulting `.app` contains the native host and worker and runs without Python, Node, the compiler or SDK.

To check just the worker, from this project directory:

```sh
../../bin/arya check main.arya
mkdir -p .build
../../bin/arya build main.arya -o .build/worker --release --force
python3 smoke.py .build/worker
DATA_FILE=/tmp/calc-basic-inspection.json .build/worker calculate '{"view":"history","expression":"12+7"}'
```

## Persistence and protocol

The native host uses `~/Library/Application Support/Arya Native/calc-basic/data.json`; `DATA_FILE` can override the file for isolated tests. Its parent directory must exist. The standalone worker defaults to `data.json` in its current directory. Run a single writer per store; the native host provides its data-file lock.

The worker receives `COMMAND JSON_OBJECT` and prints one JSON line. Required commands are `list`, `calculate` and `clear-history`; requests use `view:"history"`. Successful replies contain `ok`, `message`, `result`, `memory`, newest-first flat `rows` and `summary`. Expected errors return `ok:false` with an explanation and exit status 0. `list` does not create an empty file.

Memory commands are not exposed or accepted by this calculator.

Stores are checked before use. Invalid/corrupt data fails visibly and is never silently reset. Validated changes use a private, uniquely named sibling staging directory, write its data file, rename that file over the store, and clean up the staging directory. An existing predictable `.tmp` path is never used. Existing and dangling `DATA_FILE` symlinks are rejected and preserved. Invalid expressions and failed writes preserve the previous file. Atomic rename is not a power-loss/fsync guarantee; keep a backup if history matters.

## Verification

`smoke.py` exercises the actual compiled native worker in fresh processes and temporary storage. Arithmetic reference tests use Python `operator` functions for explicit and randomized signed-decimal cases. The suite also checks that parentheses, chains and unsupported functions are rejected. The suite verifies invalid-input preservation, last-result persistence, the 100-entry limit, history clearing, corrupt data, rejected data-file symlinks, stale temporary-path symlink preservation and failed-write rollback. Permission-failure tests run as an ordinary desktop user, not an unrestricted root account. **87 worker calls passed** in the recorded development run. Root reports separately verify final AppKit bundles and GUI behavior.

See [REPORT.md](REPORT.md) for the actual work record.
