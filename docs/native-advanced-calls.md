# Advanced native call optimization

The native compiler now adds typed scalar specialization, GC-root elision and
lexical-environment caching to the [earlier call optimization](native-function-calls.md).
The language syntax, binary64 arithmetic, dynamic fallbacks and 512-call limit
remain the supported contract.

## Typed scalar specialization

The compiler creates number/boolean variants for eligible functions, driven by
the scalar argument tags at direct call sites. A worklist propagates result tags
through the call graph. A separate availability pass retains valid recursive
groups and removes callers of unsupported variants.

Variants use C doubles for numbers and C ints for booleans. Eligible locals,
conditions, arithmetic, comparisons and logical expressions stay unboxed across
calls. The dynamic entry checks every parameter tag and boxes the result with
its actual number/boolean tag. An annotation never replaces the runtime guard.

Mixed numeric/boolean equality retains strict tag semantics. Arithmetic converts
booleans to double before operations that could otherwise use integer division
or lose negative zero. Short-circuit operators preserve operand evaluation and
value results. Changing local types, mixed return types, captures, unsupported
operations, defaults/rest and async functions retain the general implementation.

Code growth is bounded to four variants per function, eight parameters per
variant and 4096 variants per compilation. Type propagation is bounded to 64
passes; unstable graphs use the general path. Exhausting a budget affects
optimization availability, not program correctness.

## GC-root and environment work

A scalar call graph contains primitive local values only. Its callee environments
are the same lexical environment as the entry closure, or ancestors reachable
through that environment. One root at the dynamic scalar-entry boundary therefore
keeps these environments alive across the entire scalar graph, including an
allocation while constructing a depth-limit error. Scalar frames retain named
source locations and logical call-depth checks.

Generated general callers already hold their evaluated callee and arguments in
rooted frame slots. Their dynamic calls use a helper that avoids registering the
same values again. Native runtime callbacks continue to establish their own
roots. Async dispatch retains the native task/root protocol.

Outer lexical environment pointers are resolved once per general function call.
Reads and writes still access the current managed cells, preserving mutation,
live exports, TDZ checks and distinct closures sharing the same code. Current
function scopes and per-iteration captures retain their existing storage rules.
The collector remains nonmoving; cached pointers never outlive their call.

## Verification and measurement

```sh
make native-call-test
make native-test
make native-profile-test
make native-clean-test

bin/arya build main.arya --release
bin/arya build main.arya --release --no-advanced-call-opt
bin/arya build main.arya --release --no-call-opt
bin/arya build main.arya --release --runtime-counters

python3 native/tests/benchmark-calls.py
```

`--no-advanced-call-opt` retains the earlier frame/direct/numeric optimization
and disables this new call layer. `--no-call-opt` disables both call layers.
The scalar suite executes 47 assertions in advanced, previous and reference modes
in release, debug and ASan/UBSan builds, including GC stress. It covers recursive
boolean results, mixed parameters, variant budgets, signed zero, division,
short-circuiting, fallback types, multiple closures, async roots and depth errors.

The original 53-assertion suite remains enabled. Dedicated instrumented kernels
check that scalar root registrations and environment lookups do not grow with
iteration count, and that captured calls reduce redundant roots and lookups.
The counter record adds `scalarCalls`, `rootedCalls`, `rootPushes` and
`environmentLookups`. Categories overlap; counters are not timing samples.

The optional Python controller pins compiler/SDK copies, alternates fresh-process
samples, checks every result/checksum and records raw CPU/wall timings, build
times, binary sizes, source identities and host load. With `--baseline path` it
compares a retained earlier compiler; otherwise it compares the new layer with
the previous optimization in the same compiler. Python is not a native build or
application dependency.

## Measured additional improvement

The [retained raw report](benchmarks/2.0.0-alpha.2-advanced-calls-2026-11-12.json)
compares a pinned pre-change compiler with the new call pass on macOS ARM64.
Both already include the original frame/direct/numeric optimization. Nine
alternating samples produced these median CPU milliseconds per work call:

| Workload | Previous optimized compiler | New call pass | Additional speedup |
| --- | ---: | ---: | ---: |
| Fibonacci, alternating 24 and 25 | 0.7296 | 0.6465 | 1.13x |
| 100,000 / 100,001 boolean calls | 4.6485 | 0.0955 | 48.65x |
| 20,000 / 20,001 captured calls | 1.4414 | 1.3796 | 1.04x |
| 50,000 / 50,001 mixed scalar iterations | 7.5416 | 0.6788 | 11.11x |
| 100,000 / 100,001 general fallback calls | 4.7762 | 4.8662 | 0.98x |

The main gains are from unboxing scalar loops and calls. Captured and general
fallback timings changed little; the fallback median was about 2% higher and
its sample ranges overlapped substantially. These results do not establish a
general speedup for all programs.

The scalar kernel executed 200,003 specialized bodies with ten root
registrations in its instrumented process. Increasing the input did not increase
its root or environment-lookup counts. Captured-call tests also verified fewer
roots and lexical lookups without assuming that this must produce a large
elapsed-time gain.

Timings exclude startup, compilation, warmup and output. Counter builds are
separate from timing builds. Sources, exact compiler/SDK identities, raw samples,
executable sizes and host load are retained. These are single-host development
measurements, not cross-platform or application-throughput qualification.

The [validation record](benchmarks/2.0.0-alpha.2-advanced-calls-validation-2026-11-12.json)
retains source hashes, compiler convergence, test output and clean SDK evidence.
The full fresh build, all native call/data tests, standard-library sanitizer
profiles, packaging and relocated applications passed without Node/Python on
the build path. Optional live integrations remain separate gates; macOS ASan
leak detection was disabled.
