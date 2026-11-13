# Immediate numeric method calls

Arya now invokes immediate numeric `toFixed` and `toString` calls without
allocating a temporary bound function and its receiver/key environment.
The change removes dispatch work; it leaves number formatting and rounding
algorithms unchanged.

## Finding and implementation

The native compiler already resolves an immediate member call before evaluating
its arguments. Previously, numbers fell through to generic property lookup.
Each `value.toFixed(2)` or `value.toString(16)` created a two-element environment
and a bound function, then immediately called and discarded them: three wrapper
`calloc` calls and two managed objects per numeric method call.

`aimmediate_get` now recognizes these two method names only when the actual
receiver is a number. `aimmediate_call` invokes the shared `anumber_invoke`
implementation, using the receiver, key and arguments already rooted by the
generated caller. It retains the normal call-depth entry/exit check. The
existing `anumber_method` wrapper still serves detached methods and generic
calls, so stored methods retain their bound receiver across collection.

This preserves receiver/key/argument evaluation order, receiver capture before
an awaited argument, spread calls, error behavior and dynamic record/accessor
fallback. Literal member calls benefit; arbitrary computed property keys retain
the generic path. `--no-data-opt` remains the reference backend. There is no
syntax, dependency, public API or rounding change, and no handwritten assembly.

## Controlled evidence

The isolated experiment emitted C with the frozen baseline SDK, then replaced
only the numeric declaration, immediate get/call functions and numeric wrapper.
It retained all other generated C, runtime code, static libmpdec and compiler
flags. This excludes concurrent string-layout and JSON changes from the causal
comparison. Both executables used `-std=c11 -O2 -ffp-contract=off`.

The host was an Apple M1 with 8 GiB RAM, macOS 26.5.2 ARM64 and Apple clang
21.0.0. Each workload ran nine alternating fresh-process samples. Each process
warmed 2000 calls, collected, and measured process CPU for 40000 calls. One
additional process warmup per variant/workload was discarded. Startup, build
and output costs are outside the measurement. Runtime counters and GC stress
were disabled, and `PATH=/nonexistent` excluded Node and other executable tools
from the running program's search path.

| Workload | Before CPU ms | After CPU ms | Before / after |
| --- | ---: | ---: | ---: |
| `toFixed(2)` | 14.597 | 10.391 | 1.405 |
| `toString(16)` | 14.519 | 9.811 | 1.480 |
| `toString()` | 15.348 | 10.907 | 1.407 |

Every checksum matched independently calculated Python string lengths for
integers 0–9999 and exact quarter values. Python controls the experiment only.
Project builds and other project benchmarks were paused during these samples,
but system background load remained nonzero and sample spread is retained.
These are dispatch-heavy microbenchmarks, not whole-language, startup or
cross-platform speed claims. The
[raw timing report](benchmarks/2.0.0-alpha.2-numeric-calls-isolated-2026-11-13.json)
records commands, samples, host load and source/generated-C/binary/compiler
SHA-256 hashes. The baseline compiler SHA-256 is
`6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`.

Separate instrumented processes executed exactly 30000 immediate numeric calls:

| Counter | Before | After | Removed |
| --- | ---: | ---: | ---: |
| Wrapper `calloc` calls | 200352 | 110352 | 90000 |
| Managed objects | 90136 | 30136 | 60000 |
| Bound/runtime functions | 30041 | 41 | 30000 |
| Requested wrapper bytes | 25770219 | 14730219 | 11040000 |

Output strings remain allocated. These counters include startup work and count
only the runtime's allocation wrapper, not every libc/libmpdec allocation or
peak RSS. The
[allocation report](benchmarks/2.0.0-alpha.2-numeric-calls-allocation-2026-11-13.json)
also records reference-backend counts. That backend disables literal interning
as well as immediate calls, so its total allocation difference is larger and
must not be attributed solely to numeric dispatch.

## Validation and reproduction

The isolated optimized and `--no-data-opt` variants passed 60 semantic checks
with identical output in release and ASan/UBSan builds under `ARYA_GC_STRESS=1`
and an empty executable search path. The fixture covers exact/fallback
formatting, NaN/infinity, signed zero, radix restrictions, coercion and errors,
evaluation order, computed and detached calls, forced collection, spread,
optional access, custom records/accessors, awaited arguments and the recursive
call-depth boundary plus recovery. Leak detection is disabled on macOS and is
not claimed. The arithmetic implementation did not change; its broader exact
oracle is documented in [number formatting](native-number-format.md).

```sh
make native
sh native/tests/numeric-calls.sh
python3 native/benchmarks/numeric-calls.py \
  --compiler before:/absolute/path/to/retained-sdk/arya \
  --compiler after:.build/independent/arya \
  --output .build/numeric-calls-new-run.json
```

The test builds release and sanitized optimized/reference variants and asserts
the exact 30000-function reduction. It asserts at least 90000 fewer wrapper
allocations because the reference backend also changes literal interning.
The controlled baseline/candidate experiment above isolates exactly 90000.

For the retained isolated executables, reproduce the reported paired experiment
with a new output path:

```sh
python3 native/benchmarks/numeric-calls.py \
  --binary before:.build/native-fastpaths-2026-11-13/numeric-loop-before \
  --binary after:.build/native-fastpaths-2026-11-13/numeric-loop-after-isolated \
  --origin-compiler .build/native-fastpaths-2026-11-13/baseline-sdk/arya \
  --samples 9 --output .build/numeric-calls-isolated-new-run.json
```

The controller refuses to overwrite an existing report. The isolated generated
C and exact three replacement pairs are retained under
`.build/native-fastpaths-2026-11-13/` (`numeric-loop-*.c` and
`numeric-runtime-replacements.json`). Local `.build` artifacts are not source
distribution requirements. Source-based SDK comparisons include all runtime
changes between those SDKs and should be labeled accordingly.

The current integrated compiler qualification is recorded in
[native fast-path results](native-fastpaths.md), including combined measurements
and full-suite/clean-build status. Those integrated results include subsequent
string, JSON, global-cache, descriptor and number-formatting changes; attribute
only the isolated measurements above specifically to numeric dispatch. The
isolated evidence alone does not qualify a release or demonstrate production
readiness on other platforms.
