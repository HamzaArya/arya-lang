# Native UTF-8 conversion: measured ASCII storage paths

Arya's native runtime now decodes ASCII bytes directly into the final UTF-16 string buffer and encodes ASCII strings into an exactly sized byte allocation. This reduces conversion work for JSON, identifiers, numbers and other ASCII text. Unicode and malformed UTF-8 continue through the existing conversion algorithms. This is a generic runtime change; it contains no Ledger-specific input recognition.

## Finding and change

Before this change, `astrn` allocated a temporary UTF-16 array, decoded bytes into it, allocated a managed string header and final string buffer, copied the array, and freed the temporary array. For ASCII input of `n` bytes, the new path removes that temporary allocation and copy. The runtime allocation counter proves three allocations become two; the removed temporary request is `2 * (n + 1)` bytes.

Before this change, `autf8bytes` requested `3 * n + 1` bytes for every `n`-unit UTF-16 string. For ASCII, the new path requests `n + 1` bytes. The output byte count and terminating zero are unchanged. This does not eliminate the separate owning `Buffer` copy performed by callers such as `Buffer.from`.

Both paths first classify ASCII using bounded, portable C word loads. `memcpy` avoids unaligned loads and aliasing violations. Repeated bit masks reject any non-ASCII byte or UTF-16 unit on either byte order; scalar tails never read beyond the input. An endpoint check avoids scanning an entire ASCII prefix when a final unit is non-ASCII. There are no assembly, SIMD intrinsics, new libraries or platform-specific runtime dependencies.

The existing `readLine` implementation already acquires its stream lock once and uses `getc_unlocked` inside its bounded loop. This change does not add another input buffer or alter pipe blocking, framing, line limits, CRLF handling or EOF behavior.

## Ownership and compatibility

`astrn` accepts raw bytes that can belong to an otherwise unrooted managed byte buffer. Its previous implementation consumed those bytes before managed allocation could trigger collection. The new path preserves that order: allocate the final raw string buffer, fill it completely, then allocate its managed header. The pending buffer cannot be reclaimed before attachment. Its allocation is accounted immediately, which can trigger collection earlier at the subsequent header allocation. Guard tests verify that the buffer is reclaimed completely after the string dies.

The decoder's 64 MiB input limit and 16 Mi UTF-16-unit string limit remain. Embedded zero bytes are data, invalid UTF-8 retains the previous replacement granularity, supplementary characters retain surrogate pairs, and encoding lone surrogates still emits the replacement character. Non-ASCII decoding and encoding bodies are unchanged. The optimization adds no observable language syntax or API changes.

## Isolated evidence

Recorded on 2026-11-13: macOS 26.5.2, arm64, eight logical CPUs, Apple Clang 21.0.0. Release flags were `-std=c11 -O2 -ffp-contract=off`, linking the same frozen `libmpdec.a`, system math and pthread libraries. Both executables came from the same frozen compiler output; only the UTF conversion section was replaced for the candidate. This isolates the change from the concurrent numeric/compiler optimization.

Each cell is median CPU milliseconds across nine alternating fresh-process samples. Each process first performs 20 conversions and collection; an additional complete process warmup per case/backend is discarded. Timing includes only the conversion loop, excluding build, startup and output. Counters and sanitizers are disabled during timing. These are repeated conversion totals, **not Ledger request latency or speedups**.

| Conversion | Input | Repetitions | Before ms | After ms | Before / after |
| --- | --- | ---: | ---: | ---: | ---: |
| Decode | 64 ASCII units | 100,000 | 30.839 | 13.972 | 2.21× |
| Decode | 4,096 ASCII units | 4,000 | 41.369 | 2.871 | 14.41× |
| Decode | 262,144 ASCII units | 200 | 130.562 | 5.283 | 24.71× |
| Decode | 4,092 Persian/emoji units | 4,000 | 37.830 | 37.600 | 1.01× |
| Decode | 4,096 units, early Unicode | 4,000 | 40.724 | 40.970 | 0.99× |
| Decode | 4,096 units, middle Unicode | 4,000 | 40.889 | 41.308 | 0.99× |
| Decode | 4,096 units, late Unicode | 4,000 | 40.817 | 40.993 | 1.00× |
| Encode | 64 ASCII units | 100,000 | 20.621 | 15.476 | 1.33× |
| Encode | 4,096 ASCII units | 4,000 | 14.479 | 3.402 | 4.26× |
| Encode | 262,144 ASCII units | 200 | 43.876 | 9.113 | 4.81× |
| Encode | 4,092 Persian/emoji units | 4,000 | 18.987 | 18.986 | 1.00× |
| Encode | 4,096 units, early Unicode | 4,000 | 14.681 | 14.645 | 1.00× |
| Encode | 4,096 units, middle Unicode | 4,000 | 14.616 | 15.413 | 0.95× |
| Encode | 4,096 units, late Unicode | 4,000 | 14.166 | 14.173 | 1.00× |

The middle-Unicode encoding control regressed **5.45%**: classification reads an ASCII prefix before falling back to the existing encoder. Its decoding control regressed 1.02%. This is a known tradeoff, not a universal text speedup. A first experiment without the endpoint check regressed the late-Unicode encoding control by about 10%; its evidence is retained rather than discarded. The final path removes that specific full-prefix penalty without changing the general decoder. Further Unicode optimization needs separate profiling and coverage.

Evidence includes [all final raw samples and artifact hashes](benchmarks/ledger-fastpaths-2026-11-13/utf8-isolated.json), [isolated-build provenance](benchmarks/ledger-fastpaths-2026-11-13/utf8-provenance.json), and [the first experiment](benchmarks/ledger-fastpaths-2026-11-13/utf8-first-experiment.json). The first experiment used [this source snapshot](benchmarks/ledger-fastpaths-2026-11-13/utf8-first-benchmark.arya); final measurements use the checked-in benchmark. Final application results must come from the separate Ledger request harness.

## Verification

The [language fixture](../native/tests/fixtures/utf8-storage.arya) passed 520 assertions using the frozen baseline and candidate under GC stress. The final candidate also passed with AddressSanitizer and UndefinedBehaviorSanitizer. Cases include ASCII lengths around word/tail boundaries, NUL, byte slices, early/middle/late non-ASCII, Persian, emoji, malformed UTF-8, lone surrogates, and strings retained across asynchronous suspension and collection.

The [C guard probe](../native/tests/utf8-storage-guards.c) passed 530,860 checks in both release and ASan/UBSan builds. It checks inaccessible page boundaries, all byte values in each tested byte lane, all 65,536 UTF-16 values in each tested unit lane, non-ASCII positions across lengths 1 through 65, allocation counts and requested sizes, unrooted byte-owner lifetime, full collection/reclamation and both size limits. Baseline guard coverage passed 2,086 checks before adding the candidate-only classifier checks. Leak detection was disabled in sanitizer runs; explicit heap/allocation reclamation assertions remain enabled.

The [final validation record](benchmarks/ledger-fastpaths-2026-11-13/utf8-validation.json) contains compiler commands, environment, output and hashes. These focused checks qualify the conversion section; the full SDK, clean-checkout and Ledger integration gates are reported separately. Other CPUs, operating systems and big-endian hardware have not been measured or executed in this focused run.

Run acceptance with the current native SDK (no Node.js or Python required):

```sh
sh native/tests/utf8-storage.sh
```

Reproduce a comparison using two SDKs and the optional Python measurement controller:

```sh
/path/to/before-sdk/arya build native/benchmarks/utf8-storage.arya -o /tmp/utf8-before --release
/path/to/after-sdk/arya build native/benchmarks/utf8-storage.arya -o /tmp/utf8-after --release
python3 native/benchmarks/utf8-storage.py \
  --binary before:/tmp/utf8-before \
  --binary after:/tmp/utf8-after \
  --samples 9 --output /tmp/utf8-comparison.json
```

Use the same compiler source, options and dependencies when isolating this runtime change. The controller runs binaries with `PATH=/nonexistent`, verifies length checksums and artifact hashes, and refuses to overwrite evidence. Content correctness is established by the separate acceptance fixture and guard probe. No Node.js dependency is introduced by either test or measurement tool.
