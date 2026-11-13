# Broad native and Node comparison, 2026-11-13

The existing controller was used unchanged. Native source and generated binaries were frozen before the root acceptance gates finished. The timed run started after those gates stopped. All 468 retained outputs matched their peer results; every discarded warmup was checked as well. Prepared source, C, executable and controller hashes remained unchanged.

Native baseline compiler: `6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`. Candidate compiler: `d6a89f0e72cb7dd81550efc2a3c2347ed0fe88b4bf37f42786940aac50eb49f0`. The comparator was native ARM64 Node 24.16.0 with V8 13.6.233.17-node.49, with `NODE_OPTIONS` unset. Host: macOS 26.5.2, eight logical CPUs. One-minute load was 5.460 at start and 5.456 at finish; unrelated host activity was not controlled.

| Kernel | Native baseline ms | Native candidate ms | Node ms |
| --- | ---: | ---: | ---: |
| sum | 10.843 | 10.908 | 10.715 |
| mix | 31.664 | 31.624 | 13.557 |
| fib | 0.807 | 0.835 | 0.754 |
| records | 7.834 | 7.715 | 0.483 |
| map | 3.614 | 3.428 | 0.451 |
| json | 2.250 | 2.054 | 0.475 |
| strings | 2.056 | 1.948 | 0.263 |
| decimal | 4.792 | 4.813 | 0.110 |
| parsed | — | 1.316 | 0.075 |

These are warmed kernel process-CPU observations, excluding process startup, compilation, protocol transfer, request parsing and result encoding. Two sessions each retain nine samples after three warmups. Backends and `n`/`n+1` alternate. The unchanged controller reports the **lower middle** value of 18 samples as `medianCpuMs`, rather than averaging the central pair. Its nearest-rank p95 is the largest retained value. Fibonacci pools inputs 24 and 25. No general speed ratio, application-throughput result or claim of statistically established small improvements follows from this table.

`parsed` is injected into the candidate only; there is no baseline sample for that API. Node uses fixed-scale BigInt addition of one positive constant at scale three, then formats the total. This is an exact fixed-scale accumulation comparator, **not** a general decimal-library or monetary-workflow comparison. Ordinary native `decimal` reparses/formats strings each addition, while `parsed` reuses parsed values. See [the source difference](candidate-source.diff) and [full semantic review](semantics-review.json).

The [raw report](../kernels.json) includes samples, summaries and separately instrumented native counter diagnostics. [Measurement environment](measurement-environment.json), [preparation](preparation.json), [build manifest](build-manifest.json) and [development-only JS snapshot paths](development-artifacts.json) preserve provenance. Executable JavaScript snapshots live under `native/benchmarks/evidence/native-fastpaths-2026-11-13/`, outside SDK staging.

Reproduce with a **new** output directory and retained baseline SDK:

```sh
ARYA_BENCH_COMPILER=/absolute/path/to/candidate/arya /usr/local/bin/node native/benchmarks/kernels.mjs /absolute/path/to/new-comparison --build-only
/usr/local/bin/node native/benchmarks/kernels.mjs /absolute/path/to/new-comparison --measure-only
```

The output directory must contain `baseline-sdk/arya` (a symlink to the frozen SDK is sufficient). Use the same controller hash and preserve source differences. Clear `ARYA_GC_STRESS`, `ARYA_NATIVE_LIBDIR` and `ARYA_RUNTIME_COUNTERS` as recorded in the measurement metadata. Build first; run measurements only after unrelated compilation/tests stop.
