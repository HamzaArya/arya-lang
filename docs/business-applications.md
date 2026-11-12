> Historical implementation guide. The original is preserved in [compat/node/docs/business-applications.md](../compat/node/docs/business-applications.md). Current native behavior is defined by the [native profile](native-profile.md), [SDK guide](native-sdk.md) and [qualification report](native-independence-report.md).

# Node business application APIs

Available in **1.3.0-alpha.9**, published to npm’s `next` channel.
This is a bounded experimental implementation. Runtime input validation remains
necessary at HTTP, CSV, database, JavaScript and Python boundaries.

## Runtime isolation

Module declarations and import aliases may shadow every documented host name.
The compiler renames those resolved lexical bindings in generated code and keeps
public export names and original source coordinates. Runtime helpers use the host
bindings independently. User expressions still see their lexical declarations,
including TDZ, closures, recursion and imported aliases. Mutating host objects
through `globalThis` still mutates the host. Generated internal function names
are not a public reflection contract. Rebuild generated modules when upgrading.

## Exact decimal strings

```arya
use std "decimal" as decimal
print(decimal.add("0.1", "0.2"))
print(decimal.quantize("2.345", 2, "half-even"))
print(decimal.divide("10", "3", 2, "down"))
```

| Function | Result |
| --- | --- |
| `from(text)` | Canonical decimal string, with insignificant fractional zeros removed |
| `add(a,b)`, `subtract(a,b)`, `multiply(a,b)` | Exact arithmetic, returning canonical strings |
| `compare(a,b)` | -1, 0 or 1 |
| `divide(a,b,places,rounding)` | Quotient rounded to explicit decimal places; canonical string |
| `quantize(value,places,rounding)` | Fixed-scale string, retaining requested zeros |
| `toNumber(value)` | Explicit conversion; rejects nonfinite, unsafe magnitude or decimal-string round-trip loss |
| `roundingModes` | Frozen list of supported rounding names |

Inputs are strings matching `-?(0|[1-9][0-9]*)(\.[0-9]+)?`, at most 1024
characters. No Number input, whitespace, grouping, exponent, NaN or infinity is
accepted. Places must be integers from 0 to 100. Results longer than 1024
characters fail rather than truncate. The pinned [decimal.js 10.6.0 engine](https://mikemcl.github.io/decimal.js/) uses a
private constructor, 4096 significant digits and fixed exponent bounds; these
limits cover exact add/subtract/multiply of supported inputs and division before
rounding. No global Decimal configuration is modified or exposed. The engine is
embedded only when `decimal` is imported, so generated output is standalone.

Rounding modes: `up` away from zero, `down` toward zero, `ceil` toward positive
infinity, `floor` toward negative infinity. Nearest modes choose their tie rule:
`half-up` away from zero, `half-down` toward zero, `half-even` even last digit,
`half-ceil` positive infinity, `half-floor` negative infinity. Division and
quantization require the mode explicitly. Errors are RangeErrors with codes
`ARYA_DECIMAL_INPUT`, `ARYA_DECIMAL_RANGE`, `ARYA_DECIMAL_PLACES`,
`ARYA_DECIMAL_ROUNDING`, `ARYA_DECIMAL_ZERO`, `ARYA_DECIMAL_PRECISION`.

`toNumber("0.1")` succeeds because its shortest decimal representation round trips;
this does **not** make 0.1 exactly representable in binary. Keep calculations in
strings until crossing an existing numeric interface. Values above
9007199254740991 in absolute magnitude are rejected even if one particular value
would be representable. The API does not preserve negative-zero identity.

JavaScript callers use the string API directly. Construct Prisma Decimal values
from these strings; pass Prisma values back through their `toFixed()` decimal
string (never `toNumber()`). Configure MySQL to return DECIMAL strings. JSON
serializes strings unchanged; Python receives strings and should construct
`decimal.Decimal(text)` explicitly. Decimal object identity and operators do not
cross the bridge. Currency scale, supported currencies, tax policy and allocation
policy belong to the application. A remainder allocation can compute rounded
parts and subtract their exact sum from the original total; accounting tests cover
that pattern and 0-, 2- and 3-place quantization.

## Dates, instants and zones

```arya
use std "datetime" as time
const invoiceDate = time.date("2024-02-29")
const posted = time.instant("2026-01-01T00:00:00+04:30")
print(time.dateAt(posted, "Asia/Kabul"))
print(time.zoned(posted, "America/New_York"))
```

`date(text)` validates and returns exactly YYYY-MM-DD, year 0001–9999, using the
ISO calendar and leap-year rules. It is a string, never a machine-local midnight.
Store it in a DATE column or JSON string. It does not shift with the host zone.

`instant(text)` requires an ISO timestamp with seconds and `Z` or a numeric
HH:MM offset, optionally 1–3 fractional digits. It validates calendar date, time,
and offset; rejects rollover, leap seconds and unsupported precision; returns a
canonical UTC millisecond string. UTC results must remain within years 0001–9999.
`toDate(instant)` returns a JavaScript Date; `fromDate(date)` validates and returns
a UTC instant string. Existing JavaScript Date APIs continue to work unchanged.
A database timestamp should serialize as this canonical instant; do not reinterpret
a database DATE string through a Date's local getters.

`zoned(instant, zone)` requires an explicit Intl time zone and returns
`{date, time, timeZone}` using ISO calendar/Latin digits and a 24-hour clock.
`dateAt` returns its date field. DST transitions follow the installed Node ICU
zone data; distinct instants can project to the same fall-back wall time.
`atOffset(date,time,offset)` combines a date with explicit `HH:MM:SS` time and
`Z`/numeric offset and returns an instant. No implicit local wall-time-to-IANA-zone
conversion is provided: ambiguous/gap times require the application to choose an
offset. Invalid inputs throw `ARYA_DATETIME`; Intl rejects unsupported zones with
a native RangeError. Exact display-zone support follows the qualified Node build.

## Optional type annotations

```arya
export fn invoiceTotal(invoice: {amount: number, reference?: string} | null): number {
  if invoice == null { return 0 }
  return invoice.amount
}

use js "./pricing.cjs" as pricing: {calculate: fn(number): number}
const total: number = pricing.calculate(2)
```

Annotations are optional on let/const, parameters, function results and import
aliases. Supported types: `number`, `string`, `boolean`, `null`, `undefined`,
`void`, `unknown`, `any`, `never`, `T[]`, `Promise<T>`, inline record shapes with
optional fields, unions, and `fn(T, U): R` boundary function types. No new globally
reserved type words are introduced. Record fields use comma/semicolon separators.
Default parameters are optional at calls. Rest annotations must be arrays (or explicit any/unknown); rest values are inferred as arrays and declaration output retains that shape. An async function's result annotation
specifies the **resolved value** (`: number` means a Promise<number> export).
`Promise<T>` also models explicit promise values and parameters.

Checking activates for an annotated module or an importer of checked Arya
exports. Unannotated legacy modules retain dynamic behavior. Inference covers
literals, records, arrays, arithmetic, functions, calls, await, optional access,
nullish defaults and imported Arya signatures. Missing record fields, incompatible
arguments/returns/defaults and nullable member reads produce `ARYA_TYPE`; unknown
external member access/calls produce `ARYA_TYPE_UNKNOWN`. CLI and editor use the
same checker. Strict `!= null` removes null only; it does not remove undefined.
Truthy name checks and supported null/undefined equality guards narrow names;
terminating guard fallbacks carry the surviving narrowing forward.

JavaScript/Python imports are unknown in checked modules until given an explicit
trusted shape, except supported declaration-backed JavaScript imports described
below. These declarations are developer assertions, not runtime validation.
Validate untrusted data with application schemas or `std validate`. `any` explicitly
opts out of checking; unannotated parameters and undeclared host boundaries remain
dynamic. Unsupported Arya annotation syntax is rejected.

Decimal and datetime imports have documented checked signatures in alpha.9.
The [unreleased editor/compiler work](editor-and-compiler-improvements.md) adds
list, web, MySQL, Python, file, JSON and environment signatures, list element type
propagation and a bounded JavaScript `.d.ts` reader. Its supported subset and
fallback behavior are explicit; full TypeScript compatibility is not claimed.
Unannotated modules retain dynamic behavior. Runtime validation still enforces
calendar values, decimal grammar, rounding names, data shapes and numeric limits.

Checked graph builds emit adjacent `.d.mts` files for exported bindings, including
inferred return/record types. Unknown/dynamic parts remain unknown/any in those
files. The compiler API exposes `typing.exports`, `typing.bindings`,
`typing.enabled` and `typing.declarations`. Project compilation propagates checked
export contracts dependency-first without executing modules. Single-file analysis
cannot validate another file's signatures; use project Check for that boundary.
The unreleased alpha.10 candidate adds conservative assignment/branch/loop checking,
captured-write invalidation and mutable-container compatibility. Full host alias and
exception analysis remain outside the checker; see [current limits](editor-and-compiler-improvements.md#mutation-and-control-flow). String member
inference covers length, trim/case conversion, replace/slice/substring and split;
other checked members need an explicit boundary.

## Build, tests and tooling

```sh
arya fmt main.arya --check
arya fmt main.arya
arya lint main.arya
arya test main.test.arya
arya check main.arya --json
arya build main.arya
node --enable-source-maps --inspect-brk .arya/build/main.arya.mjs
```

The formatter deterministically adjusts indentation and outer whitespace only.
It preserves comments, token spellings, statement line breaks and multiline string
contents. Invalid/incomplete syntax is refused without writing. Check exits 1 for
needed formatting. It is intentionally not a comprehensive style rewriter.

Lint reports unused local/import/function bindings (excluding exports, underscore
names and parameters/catch/loop bindings), unreachable statements after direct
unconditional control flow, and ignored direct calls to known promise-returning
functions. Codes: `ARYA_UNUSED`, `ARYA_UNREACHABLE`, `ARYA_UNHANDLED_PROMISE`.
It does not guess at arbitrary external promise behavior or whole-program paths.
Lint exits 1 on findings. Both tools are passive.

Parser recovery reports up to 20 independent errors at top-level line boundaries.
A broken function/block is skipped as a unit; an unclosed block or lexical failure
can stop recovery. No erroneous source is emitted or executed. Code frames and
stable diagnostic codes remain available through existing APIs.

`arya test file.test.arya` builds its contained graph, then invokes Node's test
runner with source maps and propagates its status. Discovery is explicit (one
entry per invocation); import `node:test` and `node:assert/strict` using `use js`.
Async tests use ordinary Node promises. Existing `node --test` suites can import
generated `.mjs` modules or bundled CJS. A failed build never launches old output.

The debug command above starts Node paused; attach a Node inspector client and
open the mapped source. Source-map failure locations and an actual Node-inspector breakpoint mapped back to an Arya statement are tested. Interactive
breakpoints in a real editor host remain unqualified for this candidate.

`createProjectBuilder(options)` from `arya-language/project` returns
`build(entry, overrides)` and `clear()`. Each build rereads the contained graph;
compilation reuse keys include source bytes, filename, output location, generated
imports and checked dependency contracts. Dependency removals, edits, signature
changes and source errors invalidate appropriately. The cache is bounded and
publication still uses `writeProject`. Build/publication failure never yields a
new executable entry. Cancellation, containment and ownership checks still apply.

```js
import {build} from 'esbuild';
import {aryaPlugin} from 'arya-language/esbuild';
await build({entryPoints:['src/main.arya'],outfile:'dist/main.cjs',bundle:true,
  platform:'node',format:'cjs',sourcemap:true,
  plugins:[aryaPlugin({projectRoot:process.cwd()})]});
```

The adapter builds contained graphs into owned `.arya/esbuild` trees and supplies
watchFiles to esbuild. Compilation caching works across rebuilds. Node package
exports and CommonJS imports are handled by the existing emitter/esbuild resolver.
Generated single modules are ESM. JavaScript uses `import()` to load them from
CommonJS across async boundaries. Synchronous `require` cannot universally load
ESM graphs with top-level await; a CJS bundle must have no top-level await. Use an
async factory/function where necessary. Source maps accompany generated and
bundled output. Dependencies resolve from the project ancestor node_modules tree.
Pass existing transaction/client objects into exported functions; no pool is
created by this adapter. AsyncLocalStorage follows native Node async execution.

The language service exports `analyzeWorkspace`, `definitionInWorkspace`,
`referencesInWorkspace`, `renameInWorkspace`, `signatureAt` and `typedCompletions`.
Snapshot APIs take caller-supplied `{uri, source}` documents; optional `moduleTypes`
metadata supplies trusted external contracts. Only supplied documents participate.
The unreleased adapters add [bounded workspace discovery and incremental analysis](editor-and-compiler-improvements.md#project-wide-editor-behavior), including closed
files, imported signatures and safe static namespace rename. Dynamic namespace
rename and general incomplete-source recovery remain unsupported. Real editor-host
qualification is separate from protocol and adapter tests.

## Streaming and cancellation

`use std "async" as work` supplies `work.map(iterable, callback, options)` as an
ordered async iterable and `await work.each(iterable, callback, options)` as a
draining consumer. Options are `{concurrency: 4, signal}`; concurrency is 1–64.
Both sync and async input iterators work. At most concurrency values are read
ahead; downstream consumption supplies backpressure. `each` does not accumulate
results. A callback receives `(value,index,signal)` and preserves Node request
context. JavaScript consumers may use `for await` on `map`; Arya can call `each`.

Failures propagate, queued rejections are observed, early exit closes the input
iterator and drains started callbacks. Cancellation is cooperative: the signal
is passed to work and checked before new work/results. An iterator.next or
callback that ignores cancellation can delay cleanup/shutdown; no forced promise
termination or automatic retry is implied. Wait for `each`/iterator cleanup before
closing application resources. Response timeouts cannot undo a committed database
transaction or external side effect. Do not retry an uncertain outcome blindly.

The existing bounded Python clients retain fresh subprocesses and optional
Python. Run `arya run fixtures/examples/business/python-benchmark.arya` for the
20-call versus one-batch benchmark. Batches amortize startup while retaining a
fresh isolation boundary per job. Persistent workers are not added: this measured
workload has a batching solution and supplies no evidence requiring persistent
cross-request state. Timings and the decision are recorded in the phase evidence.
