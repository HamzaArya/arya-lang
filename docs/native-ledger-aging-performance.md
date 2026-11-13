# Ledger aging and allocation performance

Qualification uses frozen working trees from both repositories, including their
existing local changes. No Ledger rule, Number operation order, rounding boundary,
or production routing is changed. Measurements are local synthetic calculations;
database, API and outer service work are outside the measured boundary.

## Implementation

`Number.toFixed` previously printed 1,074 places with `snprintf`, allocated and
parsed a libmpdec value, rescaled it, then formatted it again. It now decomposes
binary64 into its integer significand and binary exponent. Integer multiplication
by `5^places` and an exact binary shift produce the rounded coefficient; the
highest discarded bit determines rounding, including exact halfway values. A
checked uint64 path handles common scales without overflow. Other cases use a
16-limb stack integer, using a conservative 403-bit coefficient bound for values
below `1e21` and 0–100 places. Output is built directly as UTF-16. This follows the
[ECMAScript toFixed algorithm](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.prototype.tofixed).

Range/coercion checks, the `1e21` string-conversion boundary, nonfinite values,
negative rounded zeros and omission of the minus sign for input `-0` remain.
Decimal-library arithmetic and its accounting policy are unchanged.

Immediate numeric method calls share the existing receiver-before-arguments
lowering. They skip bound-function/environment allocations; detached methods
keep their wrappers. Cached global reads reuse the rooted global object without
allocating a temporary name string. Fields of those objects are still read on
every call, so user replacements and accessors remain observable.

A concurrently added checked 128-bit path is retained after the common uint64
path and before the portable fallback, without requiring that extension.

The compiler recognizes fresh `Object.defineProperty` data descriptors with a
value and three literal true flags. The runtime checks the resolved callable
before omitting the descriptor. Replaced callees receive a normal, mutable
record with the original field order. Spread arguments and native getter/reference
values use the ordinary argument and descriptor paths. Arguments, values and
fallback descriptors remain rooted. Readonly properties, accessors, aliases and exceptions retain
their existing behavior. This optimization applies to ordinary programs, with
no Ledger names, currencies or keys in the runtime/compiler.

## Measurement and evidence

Results below qualify the 13 November 2026 candidate on Apple M1, 8 GiB RAM,
macOS arm64 and Node 24.16.0. The retained benchmark evidence contains all raw
samples and identities; the larger local artifact directory also retains frozen
source trees, binaries, generated C, oracle cases and logs.

The controller is `native/benchmarks/ledger-aging.mjs`; phase and allocation
attribution is `native/benchmarks/ledger-aging-profile.py`. Use explicit frozen
Ledger and compiler paths. `--prepare-only true` builds artifacts for correctness
testing; `--measure-only true` then measures those exact reviewed binaries.

```sh
python3 native/benchmarks/ledger-freeze.py \
  --language /path/to/arya-lang --ledger /path/to/accounting-database \
  --out /path/to/new/frozen
# Build baseline/candidate from these snapshots, applying the runtime delta
# only to candidate. Keep their lib/ directories beside their compilers.
TZ=Asia/Kabul node native/benchmarks/ledger-aging.mjs \
  --ledger /path/to/frozen/ledger \
  --baseline /path/to/frozen/baseline/.build/independent/arya \
  --candidate /path/to/frozen/candidate/.build/independent/arya \
  --out /path/to/new/results --prepare-only true

# Run correctness checks against results/baseline and results/candidate first.
TZ=Asia/Kabul node native/benchmarks/ledger-aging.mjs \
  --ledger /path/to/frozen/ledger \
  --baseline /path/to/frozen/baseline/.build/independent/arya \
  --candidate /path/to/frozen/candidate/.build/independent/arya \
  --out /path/to/new/results --measure-only true

python3 native/benchmarks/ledger-aging-profile.py \
  --compiler /path/to/frozen/candidate/.build/independent/arya \
  --ledger /path/to/frozen/ledger --out /path/to/new/profile --node

sh native/tests/fixed-format.sh
node native/tests/tofixed-reference.mjs
node native/tests/ledger-aging-reference.mjs \
  --ledger /path/to/frozen/ledger --baseline /path/to/results/baseline \
  --candidate /path/to/results/candidate --sanitized /path/to/sanitized/worker \
  --out /path/to/new/correctness.json
```

Every timing backend discards five warmups per workload/session, retains 20
samples in each of two fresh persistent-worker sessions, and alternates backend
order. Median/p95 use nearest ranks. Worker wall time includes host JSON encoding,
pipes and decoding. Direct Node calls exclude transfer. The Node line worker is a
qualification peer, not Ledger's production worker-pool admission path. No native
production allowlist is widened. Source and binary hashes are checked; parity
and RSS probes run outside timing.

Phase CPU comes from a separate uninstrumented driver around parsing, unchanged
calculation and serialization. Allocation/GC attribution comes from a different
instrumented executable, with counts, requested bytes, managed bytes and CPU
inside helpers. Inclusive helper timings overlap and incur clock overhead; they
must not be added to or substituted for the uninstrumented timing results.
Runtime allocator timings cover calloc/realloc helpers, including capacity
checks; libmpdec allocator hooks are measured separately. Requested runtime bytes
count `amemory` allocations, with other reallocations represented in managed
bytes. A counters-only build records GC CPU without per-helper clock wrappers.
RSS is sampled separately. Node diagnostic runs retain phase CPU, resource usage and V8 GC traces.

The existing native line-reader rejects frames above 1 MiB. The larger aging
case therefore uses 3,000 rows; 10,000 allocation events fit. The unsuccessful
10,000-row attempt is retained locally. This change does not raise transport
limits.

## Results

The 5× complete-worker target and Node parity remain unmet. The unchanged rules
show a useful approximately 3.3–3.5× round-trip improvement on the two target sizes.
Calculation CPU improves more than complete requests. Production routing remains
unchanged. Historical 38.452/70.370 ms native figures were not used as baselines.

All numbers below are milliseconds, median / p95, with 40 retained observations
per backend/workload across two sessions. Direct Node excludes worker transfer;
the Node peer and both native peers include it.

| Workload | Direct Node | Node peer | Frozen native | Improved native | Native speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| aging-0 | 0.003 / 0.009 | 0.038 / 0.073 | 0.031 / 0.099 | 0.029 / 0.089 | 1.06× |
| aging-10 | 0.052 / 0.076 | 0.149 / 0.273 | 0.424 / 0.713 | 0.142 / 0.291 | 2.98× |
| aging-1000 | 2.457 / 3.042 | 6.559 / 12.104 | 37.366 / 42.661 | 10.528 / 14.520 | 3.55× |
| aging-3000 | 7.934 / 11.461 | 19.272 / 29.390 | 122.103 / 200.490 | 34.384 / 50.905 | 3.55× |
| allocation-0 | 0.001 / 0.003 | 0.037 / 0.397 | 0.024 / 0.102 | 0.025 / 0.063 | 0.95× |
| allocation-10 | 0.008 / 0.012 | 0.045 / 0.065 | 0.083 / 0.111 | 0.041 / 0.075 | 2.04× |
| allocation-1000 | 1.022 / 1.880 | 2.200 / 4.515 | 7.186 / 8.410 | 2.299 / 3.396 | 3.13× |
| allocation-10000 | 4.823 / 18.943 | 16.782 / 60.142 | 79.344 / 215.379 | 23.802 / 51.401 | 3.33× |

Session medians for the two target sizes confirm the result is repeatable:

| Workload | Session | Frozen native | Improved native | Speedup |
| --- | ---: | ---: | ---: | ---: |
| aging-1000 | 1 | 38.119 | 11.014 | 3.46× |
| aging-1000 | 2 | 35.901 | 10.168 | 3.53× |
| allocation-10000 | 1 | 82.006 | 23.802 | 3.45× |
| allocation-10000 | 2 | 72.664 | 21.359 | 3.40× |

## Measured causes and remaining costs

Phase CPU uses nine retained samples after three warmups per isolated driver.
It excludes native input/output framing, host work and waiting for the process.
Those costs are present in the complete-worker table; medians across different
drivers should not be subtracted to estimate an exact transfer cost.

| Native phase, baseline → candidate | Aging, 1,000 rows | Allocation, 10,000 events |
| --- | ---: | ---: |
| JSON parse | 1.239 → 1.299 | 5.879 → 6.250 |
| Calculation | 35.407 → 6.286 | 62.312 → 9.635 |
| JSON serialize | 1.105 → 1.230 | 1.080 → 1.439 |

| Isolated calculation kernel | Baseline CPU | Candidate CPU |
| --- | ---: | ---: |
| rounding | 44.631 | 2.880 |
| rounding-detached | 44.156 | 5.693 |
| properties | 0.409 | 0.525 |
| updates | 1.539 | 1.277 |
| descriptors | 6.566 | 1.731 |
| sorting | 1.669 | 1.236 |
| allocation | 2.380 | 2.687 |

The rounding kernel performs 10,000 Number/toFixed conversions. Property reads
and sorting use 3,000 prepared rows; updates/descriptors use 10,000 events. The
large reduction in rounding cost identifies the original dominant calculation
bottleneck. Detached methods still allocate wrappers, as their identity and
receiver lifetime require. Existing dictionary indexing and the stable sorting
comparator remain; removing global-name strings also reduces selector overhead.

The counters-only runs show allocation/GC changes without per-helper timing
wrappers. Counts include setup, parsing, calculation and serialization of one
cold request. Calculation-only object counts come from the phase attribution.

| Native counter, baseline → candidate | Aging | Allocation |
| --- | ---: | ---: |
| Runtime calloc calls | 156,140 → 33,051 | 320,565 → 59,442 |
| Tracked managed peak bytes | 7,522,600 → 6,681,364 | 16,969,244 → 9,860,130 |
| GC collections | 5 → 3 | 6 → 4 |
| GC CPU ms | 2.708 → 0.803 | 11.224 → 2.181 |

Calculation heap objects fall from 44,822 to 9,213 for aging and from 87,005 to
9,617 for allocation. The remaining fixed strings are required by the current
Number/toFixed boundary. The old formatter requested approximately 3.5/5.4 MB
from libmpdec in these calculations; the new formatter makes no libmpdec calls.
These are allocation traffic measurements, not resident-memory measurements.

Observed post-workload native RSS (KiB) is retained for every session. It does
not consistently improve for allocation, despite lower allocation counts and
managed peaks; no RSS improvement is claimed:

| Workload | Session | Baseline RSS KiB | Candidate RSS KiB |
| --- | ---: | ---: | ---: |
| aging-1000 | 1 | 13,536 | 15,072 |
| allocation-10000 | 1 | 23,040 | 24,048 |
| aging-1000 | 2 | 13,824 | 13,696 |
| allocation-10000 | 2 | 25,456 | 27,472 |

The independent transfer control echoes raw ASCII without parsing or executing
rules. Its clock-probed native peers separate input framing/UTF-8 decoding and
output encoding/writing. Echoed input/output sizes are equal, so this control
is not a subtractable estimate for Ledger’s unequal request/result sizes.

| Frame bytes each direction | Node echo median | Native baseline median | Native candidate median | Candidate read CPU | Candidate write CPU |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,024 | 0.036 | 0.028 | 0.031 | 0.011 | 0.004 |
| 262,144 | 0.914 | 2.451 | 2.649 | 1.630 | 0.362 |
| 900,000 | 2.301 | 7.228 | 7.353 | 5.121 | 1.127 |

The remaining bottlenecks are Number/string conversion and temporary strings,
record creation and dispatch, native JSON parsing, and UTF-8/UTF-16 framing and
transfer. Node’s allocation-case JSON parse CPU is about 2.030 ms versus 6.250 ms native. The C code still uses the existing stdio locking and frame-size policy. No
Node parity or full service/database/API speedup is claimed. Small/empty requests
remain dominated by fixed call overhead. Host development activity continued;
load and process CPU/RSS observations are in the raw controller report.

## Correctness and scope

- 47,177 direct toFixed-string comparisons against Node pass in release and
  ASan/UBSan builds; 372 cases also pass under GC stress. Named boundary cases
  run under all four C rounding modes and a non-C numeric locale when available.
  Cases include adjacent binary64 values, subnormals, 0–100 places, negative
  values, signed zero, large magnitudes and the `1e21` transition. Raw oracle
  cases remain in the local artifact directory.
- A separate handwritten Node aging/allocation oracle and the frozen Ledger
  Node implementation agree on supported valid inputs. Both native versions
  pass 733 cases in Kabul and Los Angeles, including 48 sanitizer/GC-stress
  cases per zone. FIFO ties, replacement order, repeated and special keys,
  currencies, negative values, boundaries and empty inputs are covered.
- Native and Node both accept the numeric strings tested; numeric keys are
  accepted by Node and rejected by native. Baseline native results and errors
  are preserved for all five out-of-domain fixtures. These differences are
  recorded rather than silently converted into a new validation policy.
- Native getter/reference descriptor values, getter errors and their existing
  mutation behavior, callee replacement, accessors, aliases, shadowing, spread
  arguments and evaluation order pass in optimized/reference, release and
  ASan/UBSan modes with GC stress. The tested throwing native value getter leaves
  an own undefined property before propagating its error; this established
  mutation is preserved.
- Core/decimal/list/JSON, data-optimization/data-path, standard-call, finance,
  function-call and advanced-call suites pass. The unchanged 5,532-case exact
  Decimal oracle passes in six release batches; an initial monolithic build
  timed out, which motivated the bounded test compilation.
- 1,444 independent Node JSON cases pass under ASan/UBSan and GC stress; the
  exact finance oracle passes 85 batches / 7,600 rows across all scales and nine
  rounding modes. Ledger’s four existing native tests pass, including 813
  deterministic calculations per time zone after relocation, financial and
  schedule rules, worker lifecycle/cancellation and host report validation.

Timing builds have no runtime counters or sanitizer instrumentation. Production
Ledger sources, host routing and allowlists were not modified. Existing working
changes are included in the frozen baseline and preserved in the live checkout.
The final measured candidate also incorporates later concurrent native edits,
including their 128-bit formatting path, numeric dispatch, contiguous string
buffers and parser/build changes. This is a
comparison of complete recorded snapshots; it does not isolate every concurrent
change. The runtime delta is relative to the pre-integration live files.

## Retained artifacts

[Raw round trips](benchmarks/2026-11-13-ledger-aging/round-trips.json),
[baseline profile](benchmarks/2026-11-13-ledger-aging/baseline-profile.json),
[candidate profile](benchmarks/2026-11-13-ledger-aging/candidate-profile.json),
[transfer control](benchmarks/2026-11-13-ledger-aging/transfer.json),
[validation](benchmarks/2026-11-13-ledger-aging/validation.json),
[source and SDK hashes](benchmarks/2026-11-13-ledger-aging/sources.json), and
[the production-source delta](benchmarks/2026-11-13-ledger-aging/runtime.patch)
are retained alongside this report. The patch is relative to the live files at
publication time. Reversing it retains concurrent changes; use the original
`baseline/` artifact tree for the exact measured baseline.

The complete frozen trees, full initial manifests, binaries, generated C, all
oracle inputs and logs remain at `artifacts/ledger-runtime-20261112-232609`. Compiler and worker hashes are in the raw results; SDK archive/header
hashes are in the source manifest. Bootstrap stage2/stage3 C equality passed
before the final narrow guards; the final release compiler and application
binaries were rebuilt and qualified with those guards. ASan leak detection was
disabled. These measurements qualify this local snapshot, not another platform
or production workload.
