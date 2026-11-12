# Exact accounting batch engine

This is the **unpublished 1.3.0-alpha.11 prototype**, available as a small standalone
`arya-accounting` package or `arya-language/accounting`. It processes invoice lines
and ledger aggregates with exact scaled integers. Its optional C++ kernel runs
through Node-API; the application still runs on Node. It does not restore the
retired whole-language native compiler.

## Use from Arya

Install the reviewed local `arya-accounting-1.3.0-alpha.11.tgz` archive as a runtime
dependency. It has no npm runtime dependencies and no install script. For a reviewed
native build use the corresponding OS/architecture archive, for example
`arya-accounting-1.3.0-alpha.11-darwin-arm64.tgz`. Registry publication has not been
performed by this work. Keep the package's `dist/native` directory beside its
`dist/accounting.cjs` file when deploying a native variant.

```arya
use js "arya-accounting" as accounting

const batch = accounting.prepareInvoices([
  {price: "19.95", quantity: "2", taxRate: "0.075"}
], {currency: "AFN", scale: 2, rounding: "half-even"})

const result = await batch.calculateAsync()
print(result.total)
```

This prints `42.89`. Prices, quantities, rates and results cross JSON boundaries as
strings. Optional integer `taxBps`/`discountBps` fields accept basis points instead
of fractional `taxRate`/`discountRate` strings; `750` basis points means `0.075`.
Do not supply both forms of the same rate. Existing `std "decimal"` retains its
broader contract and is unchanged.

## Exact calculation policy

`prepareInvoices(lines, options)` snapshots and parses data once. It returns a
frozen batch with `calculate(execution?)` and `calculateAsync(execution?)`.
`invoiceBatch(lines, options, execution?)` is the convenience prepare/calculate call.

Specify the currency tag, output `scale` (0–6), and rounding explicitly. Currency
is an application-supplied three-letter uppercase tag, not a currency-registry
lookup. Optional `priceScale` ranges from the output scale to 6 and defaults to
that scale. Use it for fractional unit prices. Quantities have six fractional
digits; the default is `"1"`. Nonzero digits beyond the selected input scale are
rejected. Extra trailing zeros are accepted. Numbers, exponent notation, grouping
and implicit float conversions are rejected.

The `line-v1` policy computes each line in this order:

1. Round price × quantity to the currency output scale.
2. Round gross × discount rate to that scale.
3. Subtract the rounded discount to get net.
4. Round net × tax rate to that scale.
5. Add net and rounded tax to get total; aggregate the rounded line amounts.

Rounding modes: `up`, `down`, `ceil`, `floor`, `half-up`, `half-down`, `half-even`,
`half-ceil`, `half-floor`. Signed prices support credit lines. Quantities and rates
are nonnegative. Discount cannot exceed 100%; tax is bounded to 10,000%. Fractional
rates have up to six decimal places. This policy is explicit and reproducible;
applications must select the policy appropriate to their invoices rather than
assuming all tax/accounting systems round at the same stage.

Results contain `gross`, `discount`, `net`, `tax`, `total`, currency, scales,
rounding, `policy`, line count and the actual `backend` used. Monetary outputs are
fixed-scale strings, including canonical zero. No monetary float is returned.

## Ledger aggregation

```js
const batch = accounting.prepareLedger([
  {account: 'cash', debit: '12.50', credit: '0'},
  {account: 'sales', debit: '0', credit: '12.50'}
], {currency: 'AFN', scale: 2});
const report = batch.calculate();
```

`prepareLedger` snapshots inputs. `ledgerBatch` prepares and calculates in one call.
Results contain total debit/credit, difference, a `balanced` flag and an ordered
array of per-account debit/credit/balance strings. Account order is first appearance.
This is pure calculation; it does not post journal entries or enforce business
permissions, journal grouping or a database transaction.

## Backends, bounds and responsiveness

Execution options select `{backend: "auto" | "js" | "native"}`. Portable JavaScript
uses BigInt. Native uses signed 128-bit intermediates and checked signed 64-bit
input/line amounts. No floating-point arithmetic is used for money by either
kernel. Aggregates may exceed 64-bit line bounds and remain exact.

The native prototype requires macOS/Linux arm64 or x64 and a compiler supporting
128-bit integers. Other systems use JavaScript unless a separately qualified native
implementation is supplied. A forced native request fails clearly if unavailable;
auto falls back to JavaScript. Native loading is lazy and is never triggered by
compiler Check or passive editor analysis. `backendInfo()` reports availability,
limits and selection policy. `ARYA_ACCOUNTING_DISABLE_NATIVE=1` forces fallback.

Auto retains JavaScript below 256 rows and for ledger workloads with fewer than
16 rows per account. These are conservative choices informed by the retained
local benchmark, not a hardware-independent optimality claim. Explicit overrides
are available for measuring a particular application's workload.

Limits: 1,000,000 rows per batch, 100,000 ledger accounts, 64-character decimal
inputs, 128-character account tags, signed 64-bit input/line minor units. Each
intermediate rounded gross/discount/net/tax/total is checked. Failure reports a
stable `ARYA_ACCOUNTING_*` code and the zero-based offending row when applicable.
No partial totals are returned on overflow or cancellation. Aggregation remains
within signed 128-bit bounds under these row/line limits.

Async execution accepts an AbortSignal, yields between chunks, and permits two
outstanding jobs per module environment. Excess work fails with
`ARYA_ACCOUNTING_BUSY`; callers apply backpressure. This is cooperative scheduling
on the current thread, not a worker pool or CPU parallelism. Preparation and final
result formatting are synchronous, and very large account vectors can increase
chunk time. Use bounded import batches or an application worker for large
request-time preparation. Cancellation cannot interrupt an individual synchronous
native chunk.

## Build and validate

From the source repository:

```sh
npm ci
npm run build
npm run build:accounting-native -- --sanitize
ARYA_TEST_ACCOUNTING_NATIVE=1 npm run test:accounting
npm run benchmark:accounting
npm run package:accounting
npm run package:accounting -- --native
npm run test:accounting-package
```

The native build is explicit. Supply `--headers /path/to/include/node` or
`ARYA_NODE_INCLUDE` if the installed Node SDK headers cannot be located. `CXX`
selects a compiler executable. No SDK is downloaded and nothing compiles during
npm installation. In a standalone installed package, `npm run build:native` builds
only this optional kernel. A successful repository build caches source/binary
identities; normal compiler builds copy only a matching local cache into `dist`.
A changed/missing cache leaves the portable backend available.

The build uses Node-API version 9, no V8/private Node APIs, no machine-specific CPU
flags, and no floating-point fast-math flags. Sanitizer checks cover the C++ core
with AddressSanitizer and UndefinedBehaviorSanitizer. LeakSanitizer is enabled on
Linux; the available macOS sanitizer does not support leak detection. Node-facing
malformed/shared/detached-buffer tests and worker-environment tests are separate.

The regression suite compares native and JavaScript outputs against an independent
100-digit Python Decimal model, including signed ties, fractional prices/rates,
input mutation, line overflow, large aggregates, cancellation and row positions.
The benchmark retains all samples, CPU/runtime/source identities, output hashes,
package sizes and RSS under `.build/accounting-performance/results.json`.

Arithmetic baselines compare the current decimal wrapper, a parsed Decimal batch,
portable fixed point and the native kernel on valid bounded inputs. End-to-end
measurements compare the same fully validated public API with JS/native execution.
Fresh-process measurements and memory are recorded separately. Results describe
those workloads and machines; they do not establish universal performance or a
production financial audit.
