# Programmer Calculator — advanced developer

A native AppKit programmer calculator with an exact unsigned 32-bit Arya engine. Native controls provide the expression field, keypad, Wrap/Checked selector, history and export. No web renderer, HTTP, eval, Node or Python is involved at runtime.

## Calculate

Numbers use decimal, hexadecimal `0x`, or binary `0b` notation. Prefixes and bit-operation words are case-insensitive. Literals must always be within 0–4294967295, even in Wrap mode. Use spaces around named binary operators.

| Expression | Result |
| --- | --- |
| `0xFF AND 0b10101010` | 170; hex `0x000000AA` |
| `NOT 0` | 4294967295 |
| `(1 OR 2) << 8` | 768 |
| `1 << 2 + 1` | 8 |
| `7 / 2` | 3; integer division |
| `0xFFFFFFFF * 0xFFFFFFFF` | 1 in Wrap mode |
| `0xFFFFFFFF + 1` | 0 in Wrap mode; overflow error in Checked |

Precedence, highest first: parentheses; unary `NOT`, `+`, `-`; `*` `/` `%`; `+` `-`; `<<` `>>`; `AND`; `XOR`; `OR`. Binary operators associate left. No floating-point literals, powers, signed-integer mode or C-style symbolic bit operators are supported. `%` means integer remainder. `>>` always zero-fills. Shift counts must be 0–31; they are not masked modulo 32.

**Wrap** arithmetic reduces each result modulo 2³². Unary `-1` consequently becomes 4294967295. **Checked** arithmetic rejects addition/multiplication/left-shift overflow and subtraction or unary-negation underflow at the operation that causes it. For example, checked `1-2+3` fails at subtraction. Bit operations and right shifts work in both modes.

Although Arya's ordinary number is binary64, this engine keeps integer intermediates within exact range. Wrap multiplication uses bounded modular doubling/addition instead of multiplying two full-width operands as a floating value. AND/OR/XOR use exactly 32 bit iterations. Results are exact for the documented UInt32 model.

The main result is decimal. Hexadecimal and a padded 32-bit binary representation appear in the calculation details and persistent summary. History and last result survive restarts; clearing history preserves the last result. Memory controls are intentionally disabled for this model.

## Build and verify

```sh
make check
make build
python3 smoke.py .build/worker
```

Run from this directory. The collection's shared builder packages the actual native calculator `.app`. Inspect a command directly:

```sh
DATA_FILE=/tmp/programmer-calculator.json .build/worker calculate '{"view":"history","expression":"0xFFFFFFFF*0xFFFFFFFF","overflow":"wrap"}'
```

Python is only the independent integer reference oracle and integration driver, never an application runtime.

## Limits and storage

Expressions are bounded to 512 characters, 256 tokens and 32 parser nesting/recursion levels. History retains 100 entries; storage is bounded to 512 KiB. Private staging and rename publish complete JSON snapshots. Invalid expressions, domains, options and failed writes preserve prior bytes. Corrupt stores fail visibly. The native host owns one store at a time; direct concurrent worker invocations are unsupported. No fsync-level power-loss guarantee is claimed.

See [REPORT.md](REPORT.md) for actual development friction and verification evidence.
