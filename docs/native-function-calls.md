# Native function-call optimization

The independent Arya compiler optimizes function calls by default. This source
change applies to the native C11 toolchain; it does not change the retained Node
compiler or language syntax.

The current source adds a further [advanced call layer](native-advanced-calls.md)
with number/boolean variants, fewer GC-root registrations and cached lexical
environments. The measurements below describe the original optimization.

## Storage and lifetime

Before emitting code, the compiler resolves references through the existing
frontend and classifies binding writes and captures across function boundaries.
Uncaptured parameters and local bindings use rooted slots in the current call
frame. Captured bindings remain in shared managed environments. An environment
is emitted only when its scope contains captured bindings; module environments
remain managed for live exports. Uncaptured bindings in a captured scope still
use frame slots.

Scope entry initializes local slots to the uninitialized sentinel. Reads and
assignments retain temporal-dead-zone checks, including default parameters and
loop scopes. Each captured loop scope gets its own environment. Transitive
captures retain the environment chain even when intermediate scopes are omitted.

General functions use a zeroed C-stack temporary buffer when they need at most
32 value slots. Larger functions retain a heap buffer, avoiding unbounded stack
growth. Both representations participate in the same explicit GC root chain.
Suspended native tasks retain their stack and root chain; escaping closures
retain managed cells rather than pointers into a finished frame.

Debug and sanitizer builds reserve 8 MiB per native task stack, compared with
1 MiB for ordinary release builds. This accommodates larger unoptimized and
instrumented C frames while preserving the existing 512-call limit. Reserved
stack capacity is not a measurement of resident memory.

## Direct calls and numeric specialization

Calls to synchronous function declarations with no writes, and const bindings
initialized with functions, name the proven C function directly. Callee and
arguments are still evaluated first, in source order. Defaults, rest arguments,
spread and pipelines use the normal argument protocol. Mutable targets,
imported member calls, optional calls and async functions retain dynamic dispatch.

A fixed-point analysis identifies numeric functions and recursive groups. Eligible
functions have no default/rest parameters and use supported scalar expressions,
local assignments, if/while control flow and numeric returns. Calls within a
numeric group must target unwritten hoisted function declarations and have the
exact parameter count. Numeric arguments are evaluated into separate temporaries
before a direct call; calls in loop conditions run on each iteration.

The public dynamic entry checks argument tags before selecting the numeric body.
Other values and unsupported bodies use the general implementation. No annotation
is treated as a runtime guarantee. Binary64 NaN, infinity, signed zero, remainder,
power and numeric truthiness retain their runtime contracts.

Every optimized call still enters and leaves the native depth counter. Numeric
bodies retain named Arya source frames and GC roots, including on error exits.
An exhausted call depth reports the usual RangeError and unwinds normally.
Rejection traces survive native task boundaries and promise adoption.

## Inspect and verify

```sh
make native
make native-call-test
make native-test
make native-clean-test

bin/arya build program.arya --release
bin/arya build program.arya --release --no-call-opt
bin/arya build program.arya --release --runtime-counters
python3 native/tests/benchmark-calls.py
```

`--no-call-opt` disables frame-local storage, environment elision, direct calls
and numeric specialization for differential qualification. It is a diagnostic
reference mode, not a different language dialect.

`--runtime-counters` compiles optional counters and writes one JSON record,
prefixed by `ARYA_RUNTIME_COUNTERS`, to stderr when the program exits. Normal
builds contain no active counter increments or counter output. Counters report
the runtime calloc wrapper, managed objects, environments, function objects,
dynamic/direct/numeric call activity, heap temporary buffers, GC collections and
peak tracked managed bytes. The call categories overlap: entering a numeric body
is counted independently of how its entry was called. These counters do not
measure every allocator or peak RSS.

The call acceptance suite runs 53 semantic assertions in optimized and reference
debug/release builds, with GC stress, then repeats both variants with ASan/UBSan.
It checks source traces at the depth limit and allocation bounds for recursive
numeric calls and general boolean calls. The latter cannot use numeric
specialization. Increasing input size must not increase optimized calloc,
environment, managed-object or heap-temporary counts in either kernel.

The benchmark keeps timing builds separate from instrumented kernels, checks
outputs and checksums, alternates nine fresh-process samples, and retains sources,
compiler/source hashes, build times, binary sizes, raw samples and host load.
The original optional Node harness is retained under `compat/node/scripts/`.
The current optional measurement controller uses Python; native builds, core
tests and generated programs do not require Node or Python.

## Recorded qualification and measurements

On 12 November 2026, the native build converged to identical generated C across
generations. The native suite, all call checks, GC stress, ASan/UBSan, and a fresh
Node/Python-free build, SDK package and relocated installation passed on macOS
ARM64. Leak detection was disabled on this host. Exact source hashes, command
output and resolved qualification failures are retained in the
[validation record](benchmarks/2.0.0-alpha.2-function-calls-validation-2026-11-12.json).

The [raw benchmark report](benchmarks/2.0.0-alpha.2-function-calls-2026-11-12.json)
records the pinned compiler/SDK, nine alternating samples and independent
instrumented runs. Median process CPU milliseconds per complete work call:

| Workload | Reference | Optimized | Reference / optimized |
| --- | ---: | ---: | ---: |
| Recursive Fibonacci, alternating 24 and 25 | 64.330 | 0.736 | 87.45 |
| General boolean calls, 100,000 / 100,001 iterations | 38.613 | 4.941 | 7.81 |
| Captured dynamic calls, 20,000 / 20,001 iterations | 7.874 | 1.459 | 5.40 |

Separate kernel processes evaluate each input once. Runtime calloc-wrapper calls
fell from 1,767,792 to 29 for Fibonacci, 1,000,046 to 29 for boolean calls, and
200,055 to 35 for captured calls. The Fibonacci and boolean kernels use one
module environment and no heap temporary buffers. Captured calls retain three
environments: the module and the two independent factory captures.

These are single-host microbenchmarks under the recorded development-machine
load. Each variant uses separately calibrated even batches, so both input sizes
have equal proportions. They do not establish performance on other platforms or
arbitrary applications. Other native editor, filesystem and HTTP work continued
in the shared checkout; the validation record distinguishes the tested clean
snapshot from subsequent source differences.
