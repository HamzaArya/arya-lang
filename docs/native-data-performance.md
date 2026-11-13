# Native data performance

Native Arya uses guarded number/boolean specialization, rooted dynamic calls, statement temporary reuse, pooled literals, validated field offsets, immediate built-in calls, parser-local JSON key reuse, indexed Map/Set lookups and explicit list reservation. These optimizations retain native source errors and collector roots. Comparison flags include --no-call-opt, --no-advanced-call-opt and --no-data-opt.

The performance audit fixes add ordered hash indexes for wide records and deduplication, stable Map/Set entry slots with deletion tombstones, cached built-in namespaces, batched Promise completion ordering, shared immutable string prefixes, buffered operating-system randomness, and sparse list pages. The collector owns the new indexes and traces only tracked sparse pages. String snapshots, key identity, insertion order, duplicate JSON keys and readonly accessors retain their contracts.

Compiler validation runs independently of C emission. The tokenizer decodes quoted strings from slices, code generation joins output fragments once, and editor ranges use token positions or a bounded UTF-16 block index. The language server reuses parse tokens. Run-cache metadata records exact module contents, resolved import edges, compiler/build options and executable/generated-C file information; a valid cache hit avoids parsing and C emission. Programs exceeding the bounded source-cache budget still build normally without using that cache.

`make native-test` includes `native/tests/performance.sh`, which checks aliases, collection mutation, sparse roots and filesystem scheduling in release and sanitized builds, with GC stress. The optional `python3 native/tests/performance-reference.py` controller checks dependency, flag, symlink and artifact invalidation and validation without emission. The filesystem worker contract is documented in the [native profile](native-profile.md).

The performance audit was remeasured on the same macOS arm64 host. Runtime rows below use CPU milliseconds inside the operation, excluding setup, compilation and startup. The original audit used three fresh-process samples; the final source used five. Sessions were separate, so these are local microbenchmark comparisons.

| Runtime operation | Before ms | After ms |
| --- | ---: | ---: |
| 10,000 general-path Math.floor calls | 127.17 | 2.86 |
| 20,000 distinct record fields | 515.64 | 9.64 |
| 20,000-field JSON object parse | 437.10 | 5.00 |
| 16,000 Map deletions | 1219.32 | 1.96 |
| 40,000 distinct list.unique values | 1188.93 | 2.42 |
| Promise.all with 16,000 values | 628.62 | 2.37 |
| 40,000 single-character appends | 236.50 | 9.00 |
| 10,000 cached Math.random calls | 1422.98 | 1.40 |

| Tooling operation (wall time) | Before ms | After ms |
| --- | ---: | ---: |
| Check a 65,536-unit quoted string | 923.24 | 32.55 |
| LSP edit producing 400 diagnostics | 1250.32 | 17.17 |

A separate comparison alternated seven warmed cached-run commands per compiler: median wall time changed from 13.76 ms to 9.38 ms. Source and dependency validation still runs on every cache hit. One value at index 1,000,000 added 24,000,168 managed bytes before and 17,039 after; these counters exclude unused virtual address space and are distinct from RSS. FIFO regressions verify that text and JSON filesystem promises leave timers runnable while a native worker is blocked.

The [raw performance report](benchmarks/2.0.0-alpha.2-performance-fixes-2026-11-12.json) retains both sets of samples, compiler/workload hashes, the alternating cache comparison and an exact-accounting smoke measurement. The [validation record](benchmarks/2.0.0-alpha.2-performance-validation-2026-11-12.json) records the source hashes and successful native, sanitizer/GC-stress, cache, LSP, type, project, JSON, HTTP and signal checks. Reproduce the final kernels with `python3 native/benchmarks/performance-audit.py --samples 5 --output .build/performance-results.json` after `make native`; the output path must be new. These reports are in the source repository.

Promise batching sorts each ready batch once; pending batches still scan their inputs. Editor analysis still invalidates the workspace on edits. Sparse bulk mutations and cooperative CPU execution retain the limits documented in the native profile.

The qualified single-host accounting measurement used an Apple M1 with 8 GiB RAM, release C11 (-O2, floating-point contraction disabled), exact line-v1 half-even amounts and 100000 identical input rows. Each fresh process prepared a batch and calculated it five times. Three interleaved process samples produced these medians:

| Implementation | Prepare ms | Five calculations ms | Process ms | Peak RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| Native Arya | 13.60 | 20.03 | 45.42 | 14.50 |
| Retained Node BigInt | 137.64 | 49.23 | 243.32 | 60.70 |
| Retained Node native addon | 141.21 | 21.40 | 216.37 | 59.56 |

Twenty fresh hello-world processes had median startup of 4.77 ms for native Arya and 39.90 ms for Node. The native hello executable was 366968 bytes; the accounting executable was 574456 bytes. SDK/dependency sizes are separate. These measurements were made while development qualification work was active, so they do not establish a universal speed ranking or performance for other applications/platforms.

The raw report is docs/benchmarks/2.0.0-alpha.2-accounting-qualified.json in the source repository. Reproduce with the optional native/tests/benchmark-accounting.py controller; Node is needed only when explicitly selecting that comparison. Core builds and applications do not use it.

## Ledger data-path qualification, 12 November 2026

The unchanged 10000-row Ledger report improved from **343.84 ms to 38.08 ms**
through the application's existing worker pool, about **9.0 times faster**.
The equivalent JavaScript pool median was 38.84 ms. This establishes approximate
median parity for this workload; the native p95 was higher and the direct stdio
worker remained slower than JavaScript. All comparisons retain exact amounts,
half-up line/subtotal rounding, type order, and original line order. Neither
Ledger integration nor its accounting policies were changed.

The [evidence directory](benchmarks/native-data-2026-11-12/README.md) contains raw
samples, commands, source/toolchain identities, executable/generated-C hashes,
compatibility outcomes, and test logs. Earlier accounting results above are a
different workload and are retained separately.

### Source and measurement boundaries

Both compilers reported `Arya native 2.0.0-alpha.2 (self-hosted)`. The initial
baseline was the dirty source at `5ea5cdb52b665f2d02ab73483154f14555b79cc6`;
the qualified source was frozen at `28d27826ae74386dc81a652d24752409c6e2fb6a`
plus recorded working-tree changes. Use the per-file hashes and source archives,
not the version/revision alone. The complete local archives are
`.build/performance-2026-11-12/{baseline,qualified}-source.tar.gz`; their SHA-256
identities are in the corresponding evidence JSON files.

The final compiler was rebuilt from the checked-in C seed; independently emitted
stage-two and stage-three C matched byte for byte. Its SHA-256 is
`02ee8b454cc3a36c190250e7765346eab90ef326e99136e8bf5ce33dc4e35daa`.
The shared checkout continued receiving private cache-fingerprinting changes
after the freeze. Those edits are preserved and are outside this snapshot's
qualification. The staged SDK uses the frozen compiler, runtime and libraries.
Its local destination is `.build/performance-2026-11-12/sdk`; the
[SDK verification record](benchmarks/native-data-2026-11-12/qualified-sdk-delivery.json)
identifies its code inputs and relocated build checks.

Host: Apple M1, 8 GiB RAM, macOS 26.5.2 ARM64, Apple Clang 21.0.0,
macOS SDK 26.5; application C flags `-std=c11 -O2 -ffp-contract=off`, static
libmpdec 4.0.1 and PCRE2 10.49 where used, `-lm`, and candidate `-pthread`.
Full SDK hashes and vendored dependency versions are recorded in the source and
compiler identity files. Optional controllers used Node 24.16.0 and Python
3.13.15. Native builds and programs require neither interpreter.

The initial baseline used a shared SDK library directory. For the headline
comparison, its retained emitted C was relinked against the same frozen static
SDK as the candidate (`baseline-controlled`). Its C is byte-identical to the
initial baseline C; initial executables and measurements remain intact. Exact
link commands and SDK hashes are in
[its artifact record](benchmarks/native-data-2026-11-12/stages/baseline-controlled/artifacts.json).

Each warmed comparison used three discarded warmups, alternating backend order,
nine retained samples per session and two sessions. Reported p95 uses nearest
rank; with 18 samples it is the largest observation. Samples and outliers are
retained. These are local measurements with ordinary host activity, not
confidence intervals or platform release claims.

### Application latency and phase CPU

| Boundary / rows | Baseline median / p95 ms | Qualified median / p95 ms | JavaScript median / p95 ms |
| --- | ---: | ---: | ---: |
| Existing Ledger pool, 1000 | 12.17 / 15.28 | 3.70 / 4.76 | 4.39 / 7.84 |
| Existing Ledger pool, 10000 | 343.84 / 493.04 | 38.08 / 56.96 | 38.84 / 48.58 |
| Direct persistent stdio, 1000 | 14.56 / 16.30 | 3.08 / 3.46 | 3.22 / 3.88 |
| Direct persistent stdio, 10000 | 390.33 / 491.85 | 34.54 / 41.57 | 29.09 / 72.54 |

The pool includes Ledger's unchanged V8 admission/size checks, structured cloning,
worker/child transfer and result delivery. Direct round trip excludes host JSON
encoding/decoding, which is recorded separately. Each boundary uses its own
alternating session; subtracting these medians does not isolate transfer cost.
See [pool samples](benchmarks/native-data-2026-11-12/ledger-pool-qualified.json)
and [direct samples](benchmarks/native-data-2026-11-12/qualified-controlled-results.json).

| Separate 10000-row phase driver, median CPU ms | Baseline | Qualified | JavaScript |
| --- | ---: | ---: | ---: |
| Input read and decode | 10.636 | 2.573 | outside timer |
| JSON parse | 249.035 | 8.161 | 1.539 |
| Envelope length guard | 0.007 | 0.005 | 0.004 |
| Report calculation, including row decimal validation | 115.180 | 19.715 | 27.107 |
| JSON serialization | 11.529 | 4.060 | 0.966 |
| Output encode/write | 0.359 | 0.336 | 0.140 |

Phase binaries instrument the same report function separately from timed worker
binaries. Native read wall time includes idle pipe waits; Node readline decoding
is outside its phase timer. Phase medians cannot reconstruct the uninstrumented
round trip. The original request's historical phase numbers were not reused.

### Mechanisms, allocation and tradeoffs

The JSON parser no longer reserves the remaining document for every string.
Unescaped strings copy once; escaped strings share bounded parser scratch;
repeated property names use a bounded parser-local rooted cache. Serialization
preflights plain data before reading slots directly; getters, callbacks,
references, tagged arrays, replacers and other dynamic cases retain the generic
path. ASCII runs and output-buffer growth avoid repeated copies.

Compiler changes pool immutable literals, validate cached field offsets, reuse
statement temporaries, prepare immediate built-in methods before argument
evaluation, and guard proven decimal/JSON native calls. Mutable targets, live
imports, accessors, closures, exceptions and suspended frames keep generic/rooted
paths. The compatible decimal string API uses checked integer operations when
coefficient, scale alignment, product and rounded result fit; otherwise it uses
the original arbitrary-precision implementation.

Controlled intermediate sessions are retained: JSON runtime work reduced a
direct median from 402.51 to 156.87 ms; the data-lowering session measured
363.40 / 144.02 / 66.01 ms for baseline / JSON / data stages; the decimal and
serializer session measured 370.21 / 128.63 / 55.91 / 38.42 ms; the line-reader
session measured 36.94 to 29.17 ms. These are separate sessions, not a single
additive speedup model. Their raw files and stage hashes are in the evidence
directory.

| One fresh process, one 10000-row request | Baseline | Qualified |
| --- | ---: | ---: |
| Managed heap objects | 430729 | 75970 |
| Managed function objects | 20224 | 290 |
| Heap temporary buffers | 10005 | 1 |
| `calloc` wrapper calls | 1016463 | 232444 |
| GC collections | 8 | 5 |
| Peak tracked managed bytes | 36954174 | 17462684 |
| Peak process RSS MiB | 52.97 | 30.09 |

JavaScript's separately measured process peak was 69.66 MiB. Counter builds and
RSS runs are separate from timing binaries. Additional baseline instrumentation
recorded 26.42 GB of cumulative wrapper allocation requests, versus 28.27 MB for
the candidate; these are allocation traffic, not resident memory. The counters
exclude reallocations, raw malloc users, libmpdec and allocator metadata. GC CPU
samples are retained as diagnostics, not included in latency claims.

The combined collection/string work has a measured cost: compared with the
earlier `optimized` stage, it adds exactly 55561 `calloc` requests and 2993472
requested bytes for this request. The difference is accounted for by a separate
32-byte shared-string buffer header per string and 16 extra bytes per managed
header. A same-session confirmation measured direct medians of 33.19 ms for
`optimized` and 33.46 ms for `qualified`; parse CPU was 6.74 versus 8.01 ms.
This allocation regression remains a priority even though the overall application
gain is large. See
[confirmation samples](benchmarks/native-data-2026-11-12/qualified-confirmation.json).

| Other measured cost | Baseline | Qualified |
| --- | ---: | ---: |
| Fresh empty-report process median / p95 ms | 2.93 / 3.74 | 3.34 / 23.38 |
| Forced full application build median ms | 4664.65 | 5081.78 |
| Worker executable bytes, common SDK | 1197096 | 1240360 |

Startup uses a warm filesystem, two discarded launches and 15 retained launches
per backend, including module setup, transfer and final cleanup. The native p95
contains a retained outlier; Node measured 38.89 / 52.66 ms. Forced builds include
frontend, C emission, Clang and linking, with one warmup and three alternating
samples. Build cost increased about 8.9%; worker size increased 3.6%. The frozen
C-seed bootstrap took 118.54 seconds with cached dependency libraries; earlier
bootstrap times had different cache/contention conditions and are not speedup
comparisons.

### New APIs, collections and bounded workloads

The [API contracts](native-finance-data.md) document immutable parsed decimals,
explicit Money values, prepared invoice/budget/score/production batches, allocation
and depreciation policies, indexed collections, reservation, CSV limits,
backpressure and cancellation. Existing prepared fixed-point invoice and ledger
engines were reused. These APIs are opt-in; the Ledger benchmark uses its
unchanged string-based calculations.

Final kernel CPU medians are recorded separately from application latency:

| Workload | Baseline ms | Qualified ms | Node ms |
| --- | ---: | ---: | ---: |
| Sum, 10 million iterations | 10.092 | 10.088 | 10.216 |
| Mixed binary64, 2 million iterations | 31.857 | 32.346 | 13.683 |
| Recursive Fibonacci 24/25 | 0.845 | 0.852 | 0.772 |
| Create/read 20000 small records | 45.352 | 7.524 | 0.435 |
| Map insert/read 3000 keys | 28.337 | 3.586 | 0.471 |
| JSON round trips, 1000 | 4.564 | 2.564 | 0.542 |
| String method chain, 1000 | 5.030 | 2.172 | 0.385 |
| Wide exact string additions, 5000 | 6.185 | 5.048 | 0.174 |
| Parsed exact additions, 5000 | unavailable | 1.254 | 0.121 |

The parsed API is about four times faster than the candidate's string API for
this repeated wide-addition kernel. Node's decimal kernel uses a fixed-scale
BigInt oracle, not the full decimal API. Scalar kernels retained their earlier
specialization; the mixed-number and recursive paths remain below JavaScript's
performance. Raw samples alternate n/n+1 and backend order, with two sessions.

The CSV example streamed 1000 / 10000 / 100000 / 1000000 rows in median
9.07 / 19.87 / 125.21 / 1210.66 ms. Peak RSS across the three measured runs was
14.22 / 19.83 / 21.14 / 21.27 MiB respectively, with 100 accounts. A separate
signed-integer oracle checks accumulation, half-even boundary rounding and output;
formula-looking account names stay data. These are fresh processes reading
already-generated files with warm filesystem caches, one warmup and three
alternating-size samples. Decoder, account-count and field limits bound retained
state; no whole-file buffer is used.

The runtime/editor audit recorded a 19.12 ms median sequential LSP edit with 400
unused-binding diagnostics, 31.44 ms cached `arya run`, 4.28 ms direct hello, and
17039 added managed bytes for a sparse write at index 1000000. These are final
snapshot measurements, not matched baseline speedups. Subsequent shared-tree
cache-fingerprint changes are outside these samples. Full results are in
[`qualified-workloads`](benchmarks/native-data-2026-11-12/qualified-workloads/).

### Correctness and reproduction

All frozen-source gates passed. `make native-test` covers core behavior, live
exports, source errors, call optimizations/reference modes, mutable captures,
temporary lifetimes, JSON fallbacks, standard-call evaluation order, financial
bounds, collection ordering, sparse roots and filesystem scheduling. The full
native profile fixtures passed ASan/UBSan and GC stress. Another 4368 glob cases
passed the sanitized reference check.
Leak detection was disabled for these sanitizer gates and is not claimed.

Independent checks passed: 5352 pure-Python decimal cases across all nine rounding
modes and integer/fallback boundaries; 1425 Node JSON cases; 140 Python CSV and
35 chunk/whole-file UTF-8 cases; 10 line/EOF/NUL/byte-limit cases; 105 checker
flow/closure/alias cases; dependency/flag/symlink/artifact cache invalidation;
project templates, HTTP lifecycle and editor launcher integration. All 803 Ledger
cases matched in Kabul and Los Angeles in both release and ASan/UBSan GC-stress
builds. New finance APIs independently matched 481 retained Ledger cases.
Relocated SDK Money and CSV programs built with a cc-only PATH and ran with
`PATH=/nonexistent` and GC stress. Binary dependency inspection found no Node or
Python dependency. Live Python/MySQL/desktop host integration retains its separate
qualification gates.

From the repository, with the retained snapshots in place:

```sh
out="$PWD/.build/performance-2026-11-12"
compiler="$out/qualified-source/.build/independent/arya"
library="$out/qualified-source/.build/independent/lib"
make -C "$out/qualified-source" native
ARYA_NATIVE_BIN="$compiler" make -C "$out/qualified-source" native-test
ARYA_NATIVE_BIN="$compiler" sh native/tests/profile.sh
ARYA_NATIVE_BIN="$compiler" python3 native/tests/decimal-reference.py
ARYA_NATIVE_BIN="$compiler" node native/tests/json-reference.mjs
ARYA_NATIVE_BIN="$compiler" python3 native/tests/csv-reference.py
ARYA_NATIVE_BIN="$compiler" node native/tests/ledger-finance.mjs "$out"
node native/benchmarks/ledger.mjs build --out "$out" --compiler "$compiler" --label qualified
# Rebuild the original frozen baseline with the same pinned static SDK.
ARYA_NATIVE_LIBDIR="$library" node native/benchmarks/ledger.mjs build --out "$out" --compiler "$out/baseline-sdk/arya" --label baseline-controlled
node native/benchmarks/ledger.mjs check --out "$out" --label qualified
node native/benchmarks/ledger.mjs measure --out "$out" --labels baseline-controlled,qualified,node --samples 9 --sessions 2 --session-name rerun
ARYA_BENCH_BASELINE=baseline-controlled ARYA_BENCH_CANDIDATE=qualified node native/benchmarks/ledger-pool.mjs "$out"
node native/benchmarks/ledger.mjs startup --out "$out" --labels baseline-controlled,qualified,node --session-name startup-rerun
ARYA_BENCH_COMPILER="$compiler" node native/benchmarks/kernels.mjs "$out/qualified-workloads"
ARYA_NATIVE_BIN="$compiler" python3 native/benchmarks/streaming.py "$out/qualified-workloads"
```

Use a new output/session name to preserve the retained measurements. `prepare`
copies unchanged Ledger calculation modules and deterministic cases into a fresh
output directory; its default reference application is the sibling
`accounting-database`. Kernel/build-cost controllers expect baseline/candidate
SDK directories as documented by their recorded commands; the final workload
directory maps `candidate` to the qualified compiler. Exact gate commands,
controller hashes and outcomes are in `qualified-suite.json` and
`qualified-benchmark-run.json`.

### JSON and report route follow-up, 2026-11-12

A subsequent pass optimized the current shared checkout and Ledger report loop.
Its baseline is the compiler and application retained immediately before this
pass, rather than the older pre-data-optimization baseline above. The [raw
follow-up report](benchmarks/2.0.0-alpha.2-route-optimization-2026-11-12.json)
contains both source identities, binary hashes, all samples, confirmation runs,
isolated JSON/admission measurements and qualification commands.

The parser reuses short immutable values when reuse is profitable, bypasses the
value cache after a low-hit window, and parses exact small integers without a
temporary heap buffer. Serialization uses an allocation-free traversal after
proving that a tree contains plain data, caches encoded property names, and
constructs ASCII output directly. Getters, callbacks, references, numeric-key
ordering, Unicode, cycles and depth/output limits retain their contracts.
Small decimal results now format directly into UTF-16; validated values already
at the requested scale can reuse their immutable text. Ledger inlines its
existing sign/rounding policy, avoids duplicate Map lookups and uses exact
fixed-text zero checks.

For 10000 report rows, 18 retained samples per implementation produced:

| Operation | Before ms | After ms | Median reduction |
| --- | ---: | ---: | ---: |
| JSON parse, separate phase CPU | 8.370 | 4.811 | 42.5% |
| Report calculation, separate phase CPU | 18.328 | 10.544 | 42.5% |
| JSON serialization, separate phase CPU | 3.114 | 1.407 | 54.8% |
| Direct persistent report, wall time | 31.913 | 19.708 | 38.2% |
| Report service including host checks/sort, wall time | 59.075 | 39.796 | 32.6% |

Each application comparison used three warmups, nine samples in each of two
sessions and alternating backend order on the same Apple M1. A varied-balance
input also improved direct median wall time from 33.178 to 23.242 ms. Phase
drivers are separate from uninstrumented workers, so their medians cannot be
added to reconstruct wall time. The service measurement includes input
preparation, actual inline/worker selection, calculation, output validation and
sorting; database queries and network delivery are outside this boundary.

Prepared native reports now encode one owned snapshot at admission. Generic
worker inputs retain structured-clone behavior; V8 byte accounting, bounded
queues and cancellation remain enforced. Response framing avoids a per-byte
JavaScript scan and a redundant single-chunk concatenation. Admission alone
changed from 6.869 to 2.475 ms median CPU for 10000 rows. Eight concurrent native
requests measured 52.3 / 81.7 / 117.2 jobs per second with one / two / four workers;
the default remains two because deployment capacity and host work vary.

Ordinary background activity caused isolated wall-time outliers, all retained.
With 18 samples, nearest-rank p95 is the largest observation: the initial after
run reached 79.63 ms direct and 327.47 ms at the service boundary. A separate
confirmation measured before/after medians of 30.79/18.94 ms direct and
50.26/36.03 ms service, with after p95 of 29.36 and 47.02 ms. These local median
improvements do not establish a tail-latency guarantee.

The final compiler passed `make native-test`, 1444 independent Node JSON cases,
5532 independent Python decimal checks, the frozen previous 803 Ledger cases,
and 813 strengthened Ledger cases in both time zones. Sanitizer and GC-stress
paths cover JSON ownership, ordering, callbacks, exact arithmetic and runtime
behavior. Worker and host tests cover snapshot mutation, input/queue limits,
fragmented Unicode, cancellation, shutdown/reopen and caller-mutated account
types. The native Ledger artifact and its source-checking manifest were rebuilt.
Native report selection remains opt-in; other application task migrations have
their own policy and qualification requirements.

Reproduce the retained before/after application comparison with its local
snapshots in place:

```sh
out="$PWD/.build/speed-optimization-2026-11-12"
node native/benchmarks/ledger.mjs measure --out "$out" --labels before,after,node --samples 9 --sessions 2 --session-name another-direct
node native/benchmarks/ledger.mjs measure --out "$out" --labels before,after,node --samples 9 --sessions 2 --varied --session-name another-varied
ARYA_BENCH_BASELINE_LEDGER="$PWD/.build/speed-opt-original-app" node native/benchmarks/report-routes.mjs "$out" "$PWD/../accounting-database" --session-name another-route
```

### Remaining priorities

1. Reduce shared-string/header allocation overhead while retaining immutable
   prefix snapshots. Continue profiling the remaining JSON decode/encode work
   and small-record storage after the follow-up improvements above.
2. Improve startup and forced-build cost. Literal/namespace initialization,
   runtime code size and SDK/cache fingerprinting need separate controlled
   measurements before changing defaults.
3. Add a nominal parsed-decimal checker contract and investigate owned decimal
   accumulators or unboxed numeric/decimal vectors. Current handles are immutable,
   collector-owned and checked at native boundaries; vectors remain planned.
4. Define transport/embedding ownership, errors, handles, threading and cancellation
   before a compact batch protocol or versioned public C ABI. Additional backends,
   aggressive inlining, SIMD and parallel execution remain separate proposals.
