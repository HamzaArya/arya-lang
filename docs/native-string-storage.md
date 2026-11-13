# Native string storage

Arya now allocates a shared UTF-16 string buffer and its metadata together. A new string previously needed three managed allocator calls: its string object, buffer header, and character array. It now needs two. On the measured ARM64 host, the buffer header also shrank from 32 to 24 bytes because its separate character pointer is unnecessary.

The change is confined to `AStringBuffer`, `astring_buffer`, and `astring_release` in `native/runtime/core.c`. It preserves the existing shared-prefix append implementation. Each string object has an immutable length; appending can fill unused storage after that prefix. Branching from an earlier prefix creates another buffer, and a buffer is freed only after its last string object dies. Buffers never move while referenced. Strings remain UTF-16, including embedded zeroes and lone surrogates; there is no syntax or string-value change.

Managed bytes are charged once for the complete allocation and subtracted once on the final release. All three callers bound capacity to 16,777,216 units: `as16` checks input length, `aconcat` checks combined length and caps capacity growth, and JSON's ASCII result uses the writer's 16 MiB output limit. The allocation-size expression therefore fits supported 32-bit and 64-bit `size_t` values. No caller reallocates a shared buffer.

## Measured effect

These are **isolated string-storage results**, not a claim about every Arya program or the combined optimizer changes. The candidate replaces only the three storage blocks in C emitted by a frozen baseline compiler, keeping the workload, numeric dispatch, JSON parser, and other generated code identical. Full raw samples, allocation counters, hashes, commands, load averages, and the exact replacements are in [the measurement record](benchmarks/2.0.0-alpha.2-string-storage-isolated-2026-11-13.json).

Environment: Apple M1, macOS 26.5.2 ARM64, Apple Clang 21.0.0; `-O2 -ffp-contract=off`, 2026-11-13. Baseline compiler SHA-256: `6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`. Nine alternating fresh-process samples per variant; 1,000-iteration warmup and explicit collection before each timed loop. Timing uses process CPU milliseconds inside the workload, excluding compilation, process startup, warmup, and output. Allocations come from separate instrumented processes and include initialization, warmup, and output. All execution used `PATH=/nonexistent`.

| Workload | Iterations | Before median ms | Coallocated median ms | Median change | Allocator calls before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Short integer strings | 100,000 | 20.954 | 19.315 | 7.82% lower | 404,239 → 303,188 |
| 24-unit string slices | 100,000 | 26.832 | 25.009 | 6.79% lower | 303,239 → 202,188 |
| Small JSON records | 10,000 | 16.776 | 15.259 | 9.04% lower | 363,261 → 253,206 |
| Shared-prefix append | 100,000 | 8.393 | 8.538 | 1.73% higher | 101,273 → 101,205 |

The append ranges overlap (before 8.371–9.186 ms, after 8.331–9.596 ms); no append speedup is claimed. Most append operations already reuse a buffer, so they do not remove an allocator call. Slice ranges also overlap, despite a lower median. Host load was approximately 6.3–6.6 over the run; these are single-host observations, without statistical confidence intervals or cross-platform qualification. Reduced allocator calls are deterministic evidence; timing improvements depend on workload and allocator behavior. Requested-byte counters include output formatting, so tiny differences in timing text affect their totals.

## Reproduction and correctness

Run the regression checks against a built SDK:

```sh
ARYA_NATIVE_BIN=/path/to/sdk/arya sh native/tests/string-storage.sh
```

The suite builds optimized, optimizer-disabled, and sanitizer variants. It covers retained prefixes, branches and map keys, capacity growth, empty/Unicode/lone-surrogate strings, JSON, incremental CSV, suspended tasks, async file I/O, and reclamation under `ARYA_GC_STRESS=1`. Optimized and reference variants each passed 1,585 value assertions; the ASan/UBSan variant passed 241. An additional C probe includes the emitted runtime and checks exact allocator-call counts, exact live managed bytes, buffer ownership counts after each collection, and zero live bytes after complete reclamation. Both the frozen baseline (three allocations per fresh string) and isolated candidate (two) passed. Sanitizers ran with `detect_leaks=0` and `halt_on_error=1`; this is not a LeakSanitizer result.

Compare complete SDKs with the optional Python controller:

```sh
python3 native/benchmarks/string-storage.py \
  --compiler before:/path/to/before-sdk/arya \
  --compiler after:/path/to/after-sdk/arya \
  --output .build/string-storage-comparison.json
```

To repeat the isolated measurements with the preserved local artifacts:

```sh
python3 native/benchmarks/string-storage.py \
  --binary before:.build/native-fastpaths-2026-11-13/string-storage/before-benchmark \
  --binary isolated:.build/native-fastpaths-2026-11-13/string-storage/isolated-benchmark \
  --counter-binary before:.build/native-fastpaths-2026-11-13/string-storage/before-counter \
  --counter-binary isolated:.build/native-fastpaths-2026-11-13/string-storage/isolated-counter \
  --provenance .build/native-fastpaths-2026-11-13/string-storage/isolated-source-patch.json \
  --output .build/string-storage-repeated.json
```

The controller validates workload checksums, alternates execution order, records separate allocation measurements, refuses to overwrite evidence, and verifies artifact hashes are unchanged at completion. Python is only a benchmark controller dependency; it is not needed to build or execute Arya programs. The shell regression suite additionally requires a C11 compiler and the SDK's bundled mpdecimal library.

This improvement does not remove string objects, UTF-8 conversion temporaries, GC pauses, or the space retained when a small prefix keeps a large shared buffer alive. It does not add assembly or SIMD. The remaining work includes measuring other allocators and operating systems, and profiling workloads dominated by UTF-8 conversion or long-lived prefixes before changing their representation.
