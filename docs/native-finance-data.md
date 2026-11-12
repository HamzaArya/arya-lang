# Native exact values and bounded data processing

These APIs are implemented in the native candidate. The [performance and
qualification report](native-data-performance.md) identifies the tested source,
platform, commands, raw samples, and remaining work. They do not change Ledger's
installed packages, database, historical policies, or integration configuration.

## Exact decimals

The original string API remains compatible. Its common finite decimal operations
use checked signed 64-bit coefficients and scales up to 18 when possible. Input,
scale alignment, products, division, and rounding must fit; a miss uses the
existing libmpdec implementation. Ordinary Arya numbers remain binary64.

`decimal.values` avoids parsing and formatting every intermediate result:

```arya
use std "decimal" as decimal
const values = decimal.values
const price = values.parse("9007199254740993.005")
const adjustment = values.parse("0.005")
const total = values.add(price, adjustment)
print(values.format(values.quantize(total, 2, "half-even")))
```

| Operation | Contract |
| --- | --- |
| `parse(text)` | Validate canonical decimal text and return an immutable opaque value |
| `format(value)` | Canonical text, or fixed text for a quantized value |
| `add`, `subtract`, `multiply` | Two parsed values; return a new exact value |
| `compare` | Two parsed values; return -1, 0, or 1 without allocating a result decimal |
| `divide(a, b, places, rounding)` | Explicit rounded quotient; canonical text when formatted |
| `quantize(value, places, rounding)` | Explicit rounding; retain fixed scale for formatting |
| `toNumber(value)` | The original checked decimal-to-number round-trip contract |

The nine rounding names, 4096-digit context, 1024-character input/output bound,
and places 0–100 are unchanged. Parsed intermediates enforce the same canonical
output bound without formatting them. Quantization preserves negative zero for
a negative nonzero input rounded to zero; an input that is already negative
zero follows the existing zero-normalization contract. JSON serialization emits
the formatted decimal as a string.

Each parsed value owns one libmpdec value. The tracing collector releases that
ownership; aliases remain valid and arithmetic never mutates an operand. No
manual disposal or runtime layout is exposed. Parsed values currently have
dynamic checker contracts and checked native handle boundaries. `compare`
defines mathematical equality; ordinary object/collection identity remains
identity, including for two separately parsed equal decimals.

## Money

```arya
use std "money" as money
const policy = {currency: "USD", scale: 2, rounding: "half-even"}
const amount = money.create("100.005", policy)
const total = money.add(amount, money.create("0.10", policy))
print(money.format(total))
```

Money values are frozen records with `amount` (an immutable parsed decimal),
`currency`, `scale`, `rounding`, and `toJSON`. Currency is a three-letter uppercase
tag. It supplies no currency metadata or default accounting policy. Scale and
rounding are required, with the decimal limits above.

`create`, `add`, `subtract`, `compare`, `format`, and `toNumber` validate their
inputs. Arithmetic requires matching currency, scale, and rounding. Use
`rescale(value, scale, rounding)` explicitly to change scale/policy, or
`convert(value, currency, rate, scale, rounding)` with a positive exact FX rate.
`toMinorUnits` returns an exact integer string; `fromMinorUnits` accepts a
canonical integer string and explicit options. Checked conversion errors remain
errors rather than lossy number conversions.

JSON has deterministic field order and exact text:

```json
{"amount":"100.00","currency":"USD","scale":2,"rounding":"half-even"}
```

Options are copied; later changes to the source options do not change a Money
value. Currency mismatches never infer a conversion rate.

## Financial batches

Keep using [native accounting](accounting-engine.md) for checked fixed-point
invoice lines and exact grouping by account. Its existing prepared invoice and
ledger batches retain their limits, ordering, overflow errors, and cooperative
cancellation contract. Arbitrary-precision string/parsed decimal operations are
available when those fixed-point input bounds do not fit an application.

`std "finance"` adds these opt-in policies above parsed decimals:

| Prepare / convenience operation | Rounding and ordering |
| --- | --- |
| `prepareInvoices(lines, discount, fxRate, policy)` / `invoiceTotals` | Sum `lineSubtotal` and `taxAmount` exactly; round each aggregate; subtract discount and round total; multiply that rounded total by FX rate and round base total. Preserve discount input text. |
| `prepareBudgets(rows, policy)` / `budgetVariance` | Rows contain `budget`, `actual`, `revenue`. Round planned/natural actual first; exact difference; percentage at one place against absolute planned amount, or null for zero budget. |
| `prepareScores(pairs)` / `amountScores` | Exact difference and amount thresholds (0.005, 1%, 10%); only the resulting interpolation score is binary64. |
| `prepareProduction(amount, units, totalUnits, policy)` / `production` | Nonnegative units and positive total; round cumulative targets, cap cumulative units, subtract the previous target in original order. |
| `allocate(amount, weights, policy)` | Nonnegative exact weights with positive total; round the amount once and use cumulative targets in original order. This is a cumulative allocation policy. |
| `straightLine(cost, salvage, periods, policy)` | Round depreciable total and per-period amount; cap at remaining amount; final period receives the exact residual. |

Policy contains explicit `currency`, `scale`, and `rounding`. All batch amounts
belong to that declared currency. Batches and schedules are limited to 100000
rows/periods; decimal bounds apply to every intermediate. Invalid data records,
accessors, negative production units/weights, nonpositive denominators, and
overflow/output limits produce errors.

Prepared operations snapshot validated inputs once and expose `length`,
`calculate()`, and `calculateAsync({signal})`. Calculations create their own
accumulators and outputs. Async work yields/checks cancellation in chunks of
4096 rows, with at most two active finance jobs. Cancellation uses the signal's
`throwIfAborted`; already delivered consumer/application effects are not rolled
back. Cooperative code must yield for another task to request cancellation.

The exact invoice, budget, score, and production policies have deterministic
comparisons against existing Ledger fixtures. Their performance is separate
from the unchanged application report benchmark. These APIs do not adopt or
migrate Ledger's binary64 preview/posting policies.

## Collections

Lists remain dense/sparse managed value storage. `list.reserve(list, capacity)`
returns the same mutable list and reserves capacity without changing its length,
holes, values, or iteration order. Capacity is 0–1000000; readonly lists reject
reservation. Existing stable sorting is retained.

Map/Set retain SameValueZero key equality (NaN matches NaN; signed zeros match),
UTF-16 string value equality, object identity, and insertion/iteration order.
Collections of at least 32 entries add a private hash index of offsets into the
existing ordered storage. Updates retain position; deletion shifts ordered
storage and invalidates the index; reinsertion appends; clear removes entries.
The index rebuilds lazily and has no unrooted value/heap pointers. Lookup and
insertion improve for larger collections; deletion remains linear. The original
1000000 stored-value-slot bound remains (500000 Map pairs or 1000000 Set values).
Specialized unboxed numeric/decimal vectors are still planned.

## Streaming CSV and input

```arya
use std "csv" as csv
const decoder = csv.decoder({maxFieldUnits: 65536, maxColumns: 32})
const rows = decoder.push('account,amount\r\n"Cash",12.50\r\n')
const finalRows = decoder.finish()
```

`push` accepts at most 65536 UTF-16 units and returns completed rows. The decoder
retains an unfinished record across pushes. Double quotes escape as `""`;
quoted CR/LF, Unicode and NUL are preserved. Outside quotes, CRLF, CR, and LF end
records. Unquoted quotes and text after a closing quote are errors. A blank line
is one empty field; a trailing record terminator adds no extra record. A BOM is
ordinary field data. Delimiter defaults to comma and may be one UTF-16 unit
other than quote/CR/LF.

Defaults: 65536 decoded units per field, 1048576 raw units per record, 1024
columns. Field/record limits may be configured up to 1048576 and columns up to
1024. A failed or finished decoder cannot be reused. Call `finish` once to flush
the final record and reject an incomplete quoted field.

`await csv.each(read, consume, {signal, decoder: options})` pulls one string
chunk or null at EOF, decodes it, awaits its consumer, then yields before the
next pull. Thus the caller controls backpressure and retains only the records
it needs. Cancellation is checked between pulls/consumption; it does not undo
previous consumer effects or interrupt a blocking synchronous input read.

`io.readChunk(bytes)` reads 1–1048576 bytes from stdin, retaining up to three
incomplete UTF-8 bytes between calls. It may return an empty string while a
multibyte character is incomplete; null means EOF. Whole-input and chunked
decoding have the same invalid-input replacement behavior. Do not mix it with
`io.readLine` on the same stdin stream. `readChunk(65532)` leaves space for
carried bytes within the CSV push limit. Core libraries and executables need
neither Node nor Python.

[stream-ledger.arya](../native/examples/stream-ledger.arya) reads CSV on stdin,
checks field counts and decimal input, groups at most 4096 accounts in first-seen
order, and formats Money at the report boundary:

```sh
bin/arya build native/examples/stream-ledger.arya -o .build/stream-ledger --release
.build/stream-ledger USD 2 half-even < journal.csv
```

It supports large imports without loading the file into one string. Files and
fields are always data; account names such as `=print(99)` are never executed.

## Diagnostics

Use `arya check file.arya --json` for existing source-located machine diagnostics
and the native LSP for editor contracts. Checker state now keeps one immutable
entry per binding; mutable-capture invalidation no longer grows exponentially
with calls, and branch snapshots remain isolated.

`arya build file.arya -o program --runtime-counters` emits allocation/call counters
and `ARYA_ALLOCATION_DETAIL` on stderr at exit. The detail includes calloc-wrapper
requested bytes, string objects/units, JSON key hits, field-cache hits, checked
decimal fast paths, and GC CPU milliseconds. These counts exclude realloc,
independent malloc users, libmpdec storage and allocator metadata; use peak RSS
alongside them. Timing builds omit counters and GC timers. `--no-data-opt`
disables literal pooling, guarded field reads, immediate-method lowering, and
statement temporary reuse for compiler comparisons; runtime codec/decimal
changes remain enabled.

A public C embedding ABI, compact batch transport, alternative backends, SIMD,
parallel execution, and a nominal checker type for opaque decimal values remain
planned work. None is exposed as a stable public binding by these changes.
