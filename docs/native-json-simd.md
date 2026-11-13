# Bounded native JSON scanning

Arya scans JSON strings eight UTF-16 units at a time using ARM NEON on little-endian AArch64. Other targets use the portable scalar implementation. There is no JavaScript dependency, handwritten assembly, JIT, or executable-memory allocation. Clang/GCC compile the intrinsics into ordinary native instructions.

This change accelerates the initial unescaped portion of JSON keys and values. Escape decoding, JSON writing, number conversion, caches, allocation and errors retain their existing implementations. This is a narrow parsing improvement, not a claim that all Arya programs become faster.

## Finding and implementation

The frozen baseline's `ajstring` disassembly shows a scalar `ldrh` loop with three character classifications and a parser-offset store on every unit. The compiler did not vectorize this early-exit loop. A local-index scalar refactor alone produced essentially the same long-string times, while NEON gave a substantial improvement. That controlled comparison supports targeting the scan itself.

`native/runtime/json-scan.h` loads 16 bytes only when at least eight UTF-16 units remain. Three comparisons mark quotes, backslashes and control units below U+0020. Narrowing produces eight mask bytes; a nonzero mask is converted to the first matching lane with a trailing-zero count. Little-endian byte order is required for that mapping. The final partial vector uses scalar loads. The helper's internal precondition is `at <= length`, maintained by the parser.

Raw non-ASCII units and unpaired surrogates remain ordinary string units. The existing decoder handles escapes after the scan stops. The final emitted assembly includes `ldr q`, `cmeq.8h`, `cmhi.8h`, `xtn.8b`, `rbit` and `clz`; see the retained [before](benchmarks/native-json-simd-2026-11-13/before-ajstring.asm) and [after](benchmarks/native-json-simd-2026-11-13/after-ajstring.asm) disassembly.

An earlier eight-unit scalar-prefix prototype was rejected because short/record workloads regressed. Direct mask decoding avoids that prefix setup and a redundant scalar search inside the matching vector. Its [rejected experiment](benchmarks/2.0.0-alpha.2-json-simd-isolated-2026-11-13.json) is retained rather than hidden. The original prototype binary/C remain locally as `.build/native-fastpaths-2026-11-13/json-simd/prefix` and `prefix.c`.

## Measured results

Apple M1, Darwin 25.5.0 arm64, Apple Clang 21.0.0, `-std=c11 -O2 -ffp-contract=off`, 2026-11-13. Baseline compiler SHA-256: `6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`. Candidate binaries replace only `json.c` and its expanded header in baseline-generated C, excluding simultaneous numeric-dispatch and string-storage work. No runtime counters were enabled.

Nine fresh-process samples per variant/workload alternate execution order. Each process performs 20 warmup parses and collection before timing the parse loop with the process CPU clock. An additional process per case/backend is discarded for warmup. Construction, startup, compilation and output are excluded. All runs use `PATH=/nonexistent` and independently checked checksums. Timings are milliseconds; medians below come from the [complete raw record](benchmarks/2.0.0-alpha.2-json-simd-mask-isolated-2026-11-13.json).

| Workload | Parses | Baseline | Forced scalar | NEON | Baseline / NEON |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8,192 ASCII units | 10,000 | 66.686 | 66.237 | 17.231 | 3.87× |
| 8,192 Persian units | 10,000 | 67.689 | 67.301 | 17.714 | 3.82× |
| Long string with late escape | 10,000 | 70.525 | 70.656 | 21.711 | 3.25× |
| Four short strings | 50,000 | 42.622 | 42.846 | 42.893 | 0.99× |
| 100 short accounting-like records | 1,500 | 36.720 | 36.642 | 35.322 | 1.04× |
| 100 mixed records, Unicode/escapes/empty values | 1,500 | 67.322 | 68.247 | 64.943 | 1.04× |

The short-array median increased 0.64%, with overlapping observed ranges. Short-record medians improved 3.8% and mixed-record medians improved 3.5%. These modest differences are specific to this host/workload and do not imply a universal small-input speedup. The larger long-string gains are consistent across the tested samples. Escape-heavy strings that stop early spend most time in the unchanged decoder; serialization and other language operations are outside this result.

The initial [baseline pilot](benchmarks/native-json-simd-2026-11-13/baseline-pilot.json) was recorded before the scan change. Its shorter iteration counts and five modes differ from final qualification, so it is not used as the denominator above.

## Reproduce

Build the benchmark source with each SDK, then run the optional Python evidence collector:

```sh
before-sdk/arya build native/benchmarks/json-simd.arya -o .build/json-before --release
after-sdk/arya build native/benchmarks/json-simd.arya -o .build/json-after --release
python3 native/benchmarks/json-simd.py \
  --binary before:.build/json-before --binary after:.build/json-after \
  --output .build/json-comparison.json
```

The collector refuses to overwrite evidence and records source, controller and binary hashes, compiler/platform information, raw samples, checksums and load averages. Run without other CPU-heavy benchmarks. Python is only a development benchmark tool.

To isolate SIMD on the same generated C, compile a second binary with `-DARYA_JSON_SCALAR` using the same compiler/link flags and add `--binary scalar:PATH`. For example, with a staged native SDK:

```sh
cc -std=c11 -O2 -ffp-contract=off -DARYA_JSON_SCALAR \
  -I after-sdk/lib .build/json-after.c after-sdk/lib/libmpdec.a \
  -lm -pthread -o .build/json-scalar
```

For the recorded experiment, the baseline is `.build/native-fastpaths-2026-11-13/baseline-sdk/arya`. The benchmark binaries/C are under `.build/native-fastpaths-2026-11-13/json-simd/`; `before` uses frozen code, `scalar` disables the vector branch, and `after` uses direct mask extraction. Exact hashes and qualification details are in [validation.json](benchmarks/native-json-simd-2026-11-13/validation.json). These local snapshots are required to reconstruct that specific before/after pair; the commands above work with any two available SDKs.

## Correctness and remaining checks

Run `sh native/tests/json-simd.sh`, or set `ARYA_NATIVE_BIN` to select the current SDK. It builds native and forced-scalar variants, both in release and ASan/UBSan modes, and runs without access to Node or other executables through `PATH`.

- The C harness passes **1,911,191 checks per variant** against an independent scalar predicate. It covers every UTF-16 value in each vector lane, deterministic random buffers, every length from 0 through 1,024, stop units near vector boundaries, and start/end offsets. Buffers touch inaccessible guard pages, including zero-length tails and unaligned final vectors.
- The Arya fixture passes **7,488 semantic assertions per variant**. It covers keys and values, ASCII/Persian/supplementary characters, raw and escaped lone surrogates, all JSON escape forms, controls, truncated strings/escapes, boundary lengths through 8,193, randomized alignments and collection stress. Error classes/messages match the frozen baseline. Exact stopping offsets are checked by the C harness; the JSON API itself does not expose input offsets.
- The isolated baseline, NEON release, NEON ASan/UBSan and scalar ASan/UBSan semantic outputs match. Both scan implementations pass release and sanitized checks. Leak detection is disabled on macOS; collection stress remains enabled for the parser fixture.
- The scan test cross-compiles for x86_64 macOS using the scalar fallback. That artifact was not executed in this isolated qualification. Other CPU/OS combinations and their performance require their own runs.

The combined SDK rebuild and broader language suite are recorded separately in the native fast-path report. SIMD alone does not establish production readiness; parser limits, runtime allocation behavior, decoder costs and platform coverage remain separate engineering concerns.
