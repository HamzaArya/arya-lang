# Native runtime allocation and machine-code optimization

This follow-up starts from the already improved native compiler identified by SHA-256 `6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`. It preserves the earlier [engineering audit](native-professionalization.md), source work and release archives. Results here must not be added to, or substituted for, that audit's older benchmark ratios. This is an unpublished `2.0.0-alpha.2` candidate, not stable production qualification.

Arya already compiles through C11 to native machine code. This pass removes work from that runtime and evaluates a narrow ARM64 vector operation; it does not introduce a JIT, executable byte buffers or a JavaScript execution layer. Language syntax and documented numeric/string behavior are unchanged.

## Changes and reasons

| Measured cost | Implementation | Contract preserved |
| --- | --- | --- |
| Immediate numeric methods constructed an environment list and bound function for every call. | Dispatch immediate `toFixed` and `toString` calls directly to their shared implementation. | Evaluate receiver, computed key and arguments in order; retain bound methods when stored; preserve exceptions, roots and call-depth checks. |
| Every new UTF-16 buffer allocated its header and characters separately. | Store characters in a C11 flexible array after the shared buffer header. | Immutable string views, shared append ownership, Unicode units, terminators and complete collector reclamation. |
| JSON's unescaped-string scan examined one UTF-16 unit at a time. | Use bounded ARM64 NEON scans with a scalar reference and portable fallback. | Exact first quote, escape or control offset; no load beyond the input. Escapes and JSON semantics remain in the existing decoder. |
| High-precision `toFixed` still converted through 1,074 decimal places and libmpdec. | Add a checked 64-bit common path and a bounded 16-limb stack-integer path through 100 places, retaining the existing exact 128-bit helper. | Exact binary64 significand scaling and half-away magnitude rounding, subnormals, negative zero and all supported precisions. |
| Global lookup created a temporary name string; eligible `Object.defineProperty` calls constructed disposable descriptors. | Use the private cache's ASCII lookup and lower fresh four-field data descriptors behind a callee-identity guard. | Mutable global identity, accessors, selected callee, argument order, descriptor field order and generic fallback. |

Numeric dispatch does not alter binary64 rounding. The integrated candidate additionally replaces the earlier formatter's libmpdec fallback with exact bounded integer arithmetic; libmpdec remains the general decimal library. The string change does not make strings mutable or remove the collector. Handwritten assembly was unnecessary: the C compiler emits the target instructions. The isolated dispatch/string/SIMD records exclude the additional formatter, descriptor and global-cache changes; integrated measurements include all of them.

## Performance results

Host: Apple M1, eight logical CPUs, macOS 26.5.2 / Darwin 25.5.0 ARM64, Apple Clang 21.0.0. Candidate compiler SHA-256: `d6a89f0e72cb7dd81550efc2a3c2347ed0fe88b4bf37f42786940aac50eb49f0`. Release compilation uses `-O2 -ffp-contract=off`. Each execution comparison has nine alternating samples. Kernel CPU excludes build/startup/output; CSV CPU includes the complete fresh process, input, exact accumulation, boundary rounding, JSON output and cleanup. Inputs are in warm filesystem caches. Optional controllers, commands, hashes, raw samples and ranges are retained with each record.

| Isolated change / workload | Before CPU ms | After CPU ms | Before / after |
| --- | ---: | ---: | ---: |
| Dispatch only: 40,000 immediate `toFixed(2)` calls | 14.597 | 10.391 | 1.40× |
| Dispatch only: 40,000 immediate `toString(16)` calls | 14.519 | 9.811 | 1.48× |
| String storage only: 100,000 short conversions | 20.954 | 19.315 | 1.08× |
| String storage only: 100,000 slices | 26.832 | 25.009 | 1.07× |
| SIMD only: 10,000 parses of an 8,192-unit ASCII string | 66.686 | 17.231 | 3.87× |
| SIMD only: four short strings, 50,000 parses | 42.622 | 42.893 | 0.99× |

See [dispatch](native-numeric-calls.md), [storage](native-string-storage.md) and [SIMD](native-json-simd.md) for the controlled experiments. SIMD's long Unicode/late-escaped cases improved 3.25–3.82×. Short-array ranges overlap; no small-input speedup is claimed. The rejected scalar-prefix SIMD prototype is preserved because its short-input regression informed the final implementation.

| Combined candidate / workload | Before CPU ms | After CPU ms | Before / after |
| --- | ---: | ---: | ---: |
| `toFixed(2)`, 40,000 varied values | 44.932 | 33.740 | 1.33× |
| `toFixed(18)`, 40,000 varied values | 51.928 | 40.060 | 1.30× |
| `toFixed(100)`, 4,000 varied values | 41.166 | 7.292 | 5.65× |
| Build/read a 20,000-field record | 10.326 | 9.565 | 1.08× |
| Parse a 20,000-field JSON record | 4.077 | 3.746 | 1.09× |
| Stringify that JSON record | 0.875 | 0.898 | 0.97× |
| Append 40,000 single characters | 3.676 | 3.673 | 1.00× |
| Resolve 16,000 values with `Promise.all` | 1.762 | 1.758 | 1.00× |
| Read 16,000 Map entries | 1.906 | 1.899 | 1.00× |
| Exact CSV ledger, 10,000 rows / 100 accounts | 17.391 | 16.076 | 1.08× |
| Exact CSV ledger, 100,000 rows / 100 accounts | 121.307 | 115.914 | 1.05× |

The [formatting record](benchmarks/native-fastpaths-2026-11-13/format-integrated.json) uses an independent integer-ratio checksum oracle. The [representative workload record](benchmarks/native-fastpaths-2026-11-13/workloads.json) checks scalar kernel checksums and complete CSV JSON against an independent integer-thousandths/half-even oracle. A checksum alone is not full data equivalence; separate semantic tests check behavior. The [integrated numeric calls](benchmarks/native-fastpaths-2026-11-13/numeric-integrated.json) and [string tests](benchmarks/native-fastpaths-2026-11-13/strings-integrated.json) retain additional cases, including an append median increase with overlapping ranges. None of these are universal language speed ratios.

Separate instrumentation confirms the mechanisms: dispatch-only removal saves exactly 90,000 `calloc` calls and 30,000 bound functions over 30,000 immediate calls. Each new string buffer needs one allocation rather than two. The combined 100,000-row CSV run drops from 1,007,280 to 805,890 counted allocations; managed peak is nearly unchanged (6,956,090 to 6,866,210 bytes). Counts include program startup and do not measure allocations internal to upstream libraries or process RSS. Instrumented timings are not used in the release speed tables.

| Toolchain operation, wall milliseconds | Before median | After median |
| --- | ---: | ---: |
| Check hello source | 6.391 | 5.952 |
| Check quoted 64 KiB text | 37.020 | 34.874 |
| Check raw 64 KiB text | 40.825 | 37.234 |
| Force release build of hello | 1049.765 | 1290.739 |
| Launch built hello executable | 3.907 | 3.640 |

The [toolchain record](benchmarks/native-fastpaths-2026-11-13/toolchain.json) has nine check/startup samples and three forced builds per SDK, plus discarded warmups. Check includes loading, lexing, parsing and analysis rather than isolated parser time. Forced build includes C emission, Clang optimization and linking. Build time increased about 23% in that run; no build-speed improvement is claimed. Hello grew from 367,368 to 383,976 bytes; the compiler grew from 5,749,112 to 5,783,400 bytes.

Follow-up [Clang phase traces](benchmarks/native-fastpaths-2026-11-13/clang-phase-profile/analysis.json) identify a new cost: candidate `arm_neon.h` parsing spans 75.872–86.519 ms, median 77.875, and is absent before. Reported frontend medians rise 159.061→236.257 ms. Backend ranges overlap. These six instrumented compiler runs do **not** reproduce or explain the whole earlier 241 ms end-to-end build increase: direct driver medians actually decreased 1342.370→1295.896 ms, with a retained baseline outlier. The header cost is observed; attributing the whole build-time difference to SIMD would exceed the evidence. Runtime speed, additional code and header compilation remain practical tradeoffs. Commands, inputs and full traces are retained for follow-up on a quieter host.

Benchmark processes ran sequentially with other task builds paused. This remained a shared development host: the representative run's one-minute load ranged from 10.36 to 11.14 on eight logical CPUs. Raw ranges include outliers; small differences need quiet-host repetition before strong attribution. Allocation reductions and controlled long-string scan gains provide stronger causal evidence than small wall-time changes.

## Current Node comparison

A separate run compares this baseline/candidate with native ARM64 Node **24.16.0**, V8 **13.6.233.17-node.49**. JavaScript is the language; this table measures one Node/V8 build. Two fresh sessions retain nine samples each after three warmups per workload, alternating backend order and `n`/`n+1`. Peers stay alive across workloads. All 468 retained requests, and warmups, produced matching results across the applicable backends. CPU boundaries exclude transfer, request parsing, result encoding, startup and compilation.

The table uses the ordinary median of all 18 samples (average of the two central observations), recomputed from [raw results](benchmarks/native-fastpaths-2026-11-13/kernels.json). The unchanged controller's own summary uses the lower central observation; both are identifiable rather than silently mixed. Fibonacci pools inputs 24 and 25. Values are milliseconds.

| Kernel / base size | Arya before | Arya current | Node |
| --- | ---: | ---: | ---: |
| Sum, 10,000,000 iterations | 10.868 | 10.916 | 10.719 |
| Mixed multiply/modulo, 2,000,000 | 31.716 | 31.630 | 13.595 |
| Fibonacci, 24/25 | 0.814 | 0.837 | 0.759 |
| Create/filter 20,000 records | 7.857 | 7.821 | 0.486 |
| Populate/read 3,000 Map keys | 3.620 | 3.460 | 0.468 |
| Small JSON round trips, 1,000 | 2.255 | 2.063 | 0.487 |
| String trim/uppercase/split/join, 1,000 | 2.060 | 1.976 | 0.271 |
| Exact fixed-scale additions, 5,000 | 4.802 | 4.851 | 0.111 |
| Reused parsed decimal values, 5,000 | — | 1.316 | 0.077 |

Node remains substantially faster on these dynamic kernels. The last two rows use Node's built-in BigInt for repeated positive additions at fixed scale three; they do not compare general decimal libraries, arbitrary scales, division, rounding or financial reports. Arya's string-decimal row reparses operands, while its parsed-value row reuses an immutable value. The candidate-only parsed helper is an explicit source difference; common kernel bodies match. Counters run separately from timed peers, but can affect cache/host state. See [method and limits](benchmarks/native-fastpaths-2026-11-13/node-comparison/semantics-review.json) and [commands, versions and environment](benchmarks/native-fastpaths-2026-11-13/node-comparison/preparation.json).

This optional comparison uses the repository's existing Node controller. It is excluded from native acceptance and SDK tooling; no Node dependency was introduced into Arya. Further dynamic-object, map, string and arithmetic profiling is still needed. Long-string SIMD gains do not imply equivalent gains for the small JSON shape above.

## Reproduction and evidence

The frozen baseline SDK is retained locally in `.build/native-fastpaths-2026-11-13/baseline-sdk/`. Isolated experiments replace only the relevant runtime section in baseline-generated C; integrated comparisons build identical sources with the baseline and final compiler. Release timing excludes counters and sanitizers. Allocation checks run separately. Controllers use Python only for optional evidence collection; native acceptance has no Python or Node requirement.

```sh
make native-sdk
make check
python3 native/benchmarks/numeric-calls.py \
  --compiler before:.build/native-fastpaths-2026-11-13/baseline-sdk/arya \
  --compiler after:.build/independent/arya --output numeric-new.json
python3 native/benchmarks/string-storage.py \
  --compiler before:.build/native-fastpaths-2026-11-13/baseline-sdk/arya \
  --compiler after:.build/independent/arya --output strings-new.json
python3 native/benchmarks/fastpaths.py \
  --compiler before:.build/native-fastpaths-2026-11-13/baseline-sdk/arya \
  --compiler after:.build/independent/arya --output workloads-new.json
python3 native/benchmarks/toolchain.py \
  --before-compiler .build/native-fastpaths-2026-11-13/baseline-sdk/arya \
  --after-compiler .build/independent/arya \
  --before-label before --after-label after --output toolchain-new.json
make native-clean-test
```

## Verification and delivery

`make native-sdk`, `make check` and `make native-clean-test` all passed. The [qualification record](benchmarks/native-fastpaths-2026-11-13/qualification.json), [full check log](benchmarks/native-fastpaths-2026-11-13/check.log), [clean gate result](benchmarks/native-fastpaths-2026-11-13/clean-acceptance.log) and [compressed fresh build/test log](benchmarks/native-fastpaths-2026-11-13/clean-verification.log.gz) retain exact identities and outcomes.

- Bootstrap: stage-two/stage-three generated C is identical, both in the working build and fresh source workspace.
- Immediate numeric calls: 60 semantic assertions in optimized/reference release and sanitizer modes, matching evaluation/depth behavior and allocation budgets.
- Descriptors: existing replacement/getter/error regressions plus 37 boundary assertions per variant covering await, collection, selected callee, field order, generic descriptors and recursion recovery.
- Strings: 1,585 optimized/reference assertions, 241 sanitizer assertions, and an independent C accounting probe showing correct shared references and complete reclamation.
- JSON: 1,911,191 exact-offset/protected-page checks in each native/scalar release/sanitizer variant; 7,488 parser assertions per variant, including Unicode, surrogates, escapes and malformed inputs.
- Numbers: 3,354 existing integer-ratio oracle cases plus an expanded 15,150-case corpus across every precision 0–100, in release and ASan/UBSan with collection stress. Expanded expected outputs include 12,422 nonzero results and exercise the wide integer path 12,308 times. [Exact controller, inputs/outputs, flags and hashes](benchmarks/native-fastpaths-2026-11-13/number-reference-wide-provenance.json) are retained. General decimal arithmetic matched 5,532 pure-Python reference results.
- Compiler/tooling: 266 parser cases, 105 type/flow cases and LSP transport/editor-protocol reference checks passed on the unchanged candidate binary. [Optional-check evidence](benchmarks/native-fastpaths-2026-11-13/optional-checks-combined.json).
- Full acceptance also covers accounting journals/reports, crypto/validation/diagnostics, collections, async lifetimes, I/O workers, CSV backpressure/cancellation and 4,368 glob vectors.

The fresh source gate rebuilt native dependencies and compiler generations with Node/npm/Python and alternate JS engines excluded from the executable search path. It packaged and verified the SDK, relocated it into a path containing spaces and an apostrophe, built through a compiler symlink, and ran installed applications with `PATH=/nonexistent`. Dependency inspection found no Node, V8, Python, QuickJS or JavaScriptCore linkage in the tested compiler/service binaries. This is restricted-environment evidence; interpreters were not physically uninstalled from the host.

After the gates, one duplicate Makefile test invocation was removed. The unique `make check` command set is identical, all compiler/runtime/library/test source hashes remain unchanged, and the qualification record preserves both plans and the exact delta. No language or build recipe changed after qualification.

The final unpublished SDK is assembled separately under `artifacts/native-fastpaths-2026-11-13/`, with an archive checksum sidecar and `BUILD-INFO.txt`, `SOURCE-SHA256SUMS` and `SHA256SUMS` inside. Earlier archives are preserved. The clean workspace's intermediate archive has its own recorded identity; it contains the documentation snapshot copied at gate start rather than the final report. The preview version string alone does not distinguish these artifacts.

## Limits

Measurements on one Apple M1 host cannot establish cross-platform speed or universal superiority to Node/V8. Earlier [Node comparisons](native-data-performance.md) describe their recorded snapshots; the fresh comparison above identifies this compiler and Node version. Dynamic allocation, tracing collection and cooperative scheduling remain costs; native machine code alone does not eliminate them. Startup, compilation and representative CSV processing are measured separately from focused formatting/string kernels.

The native SDK still needs a C toolchain to build applications; generated executables run independently. Optional Python, database, browser and editor integrations retain their explicit host dependencies. The earlier audit's platform, scheduler, security, accounting and ecosystem limitations remain applicable. Other CPU/OS targets require their own qualification; the scalar fallback does not by itself establish a tested port. Sanitizers use `detect_leaks=0`, and upstream static dependencies are not sanitizer-instrumented. Live Python/MySQL/desktop/editor-host integrations were not repeated in this pass. Production support, a stable embedding ABI and wider platform releases remain unfinished work.
