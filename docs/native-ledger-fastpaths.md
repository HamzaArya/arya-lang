# Ledger workload follow-up

This change starts from compiler SHA-256 `d6a89f0e72cb7dd81550efc2a3c2347ed0fe88b4bf37f42786940aac50eb49f0`, the compiler behind the user's **new native** column in the previous comparison. Its Ledger worker is `959bdfff7a8a320aa70a5407f07e352f610cf832e8721b2a0649c88e27a701a4`. The earlier [runtime report](native-fastpaths.md) remains a separate historical comparison. Arya remains an unpublished `2.0.0-alpha.2` candidate.

## Changes and reasons

The same Ledger source performs thousands of `Number(value.toFixed(2))` operations. The existing formatter already computes the exact rounded integer coefficient, then allocates a UTF-16 string which `Number` converts to temporary UTF-8 before parsing. The compiler now recognizes this expression behind runtime identity and argument guards, preserving both call boundaries and avoiding those disposable strings. Ordinary calls, dynamic methods, replaced callees and unsupported values retain their existing behavior. See [fixed conversion](native-fixed-number.md) for the exact numerical conditions and tests.

ASCII input previously decoded into a temporary UTF-16 array and then copied into owned string storage. It now fills the final buffer directly. ASCII output uses an exact-sized buffer and a simple narrowing loop. Bounded word classifiers use `memcpy`, supporting unaligned input without out-of-bounds loads or aliasing violations. The existing Unicode and malformed-input conversion remains the fallback. See [UTF conversion](native-utf8-storage.md), including its mixed-Unicode tradeoff.

These are general compiler/runtime changes, with no Ledger-specific intrinsic, changed calculation rule, altered production task allowlist or database operation. Arya already emits machine code through its C11 backend; the measured opportunity was unnecessary allocation and conversion. No handwritten assembly was needed.

The [implementation diff against the frozen baseline](benchmarks/ledger-fastpaths-2026-11-13/implementation.patch) isolates the three compiler/runtime files from earlier working-tree changes. New tests are registered once in `make check`; SDK staging includes the new reports.

## Measurement boundaries

The retained application controller, sources, generated compatibility modules and required host dependencies are frozen under `.build/ledger-fastpaths-2026-11-13/measurement/application`. Every frozen input and both worker binaries are hashed before and after the comparison. The adapter is `native/benchmarks/ledger-targets.mjs`; `--all true` preserves all 28 original comparisons. Optional Node/Python controllers are development evidence tools, excluded from the standalone SDK and required native checks.

Aging and allocations compare direct Node rule calls with persistent native worker round trips, including JSON and pipes. Their Node ratios are not pure execution-speed ratios. Report and production comparisons include real host-service preparation, validation and output shaping. The database, surrounding API request and cold startup are outside all four boundaries. Current production routing remains limited to its existing report and production tasks.

## Measured Ledger results

Host: Apple M1, eight logical CPUs, 8 GiB RAM, macOS 26.5.2 / Darwin 25.5.0 ARM64, Apple Clang 21.0.0. Node was native ARM64 v24.16.0. Native release builds use `-O2 -ffp-contract=off`. The new compiler is `8a034a4dee8dd637b657dcb7df19d8811854c73a0c52ff1a7fbeb2a42de3e8ec`; the new Ledger worker is `714d4be3b5a1326b7946080959c5833715d9a56217b88ff33b428095894902c8`.

Two fresh sessions retained 20 samples per backend after three warmups per comparison, with rotated/reversed backend ordering. Each backend kept one persistent process/slot within a session. All 28 original comparisons passed, with **3,864 parity assertions**. The table uses the controller's existing nearest-rank medians of all 40 retained samples; it does not substitute earlier measurements or a different median definition.

| Workload and measured boundary | Previous native ms | New native ms | Node ms | Native change |
| --- | ---: | ---: | ---: | --- |
| Aging, 1,000 rows; direct Node vs native round trip | 10.462 | 8.428 | 2.445 | 19.4% less time |
| Allocation index, 10,000 events; direct Node vs native round trip | 19.799 | 16.987 | 3.562 | 14.2% less time |
| Report preparation, 10,000 rows; full service | 27.495 | 28.050 | 37.130 | No demonstrated gain |
| Production preview, 1,000 periods; full service | 6.563 | 6.506 | 9.290 | No demonstrated gain |

Aging p95 fell from 12.550 to 10.161 ms and allocations from 23.380 to 19.678 ms. Both improved in each session. Report median rose 2.0%, while p95 fell from 44.030 to 34.910 ms; its median's direction reversed between sessions. Production median fell 0.9%, with almost identical p95 values, 6.918 and 6.940 ms. These spread values do not establish significance: neither a report regression nor a production gain is claimed. Node remains substantially faster for the direct aging/allocation calls at their different measurement boundaries.

The [complete raw comparison](benchmarks/ledger-fastpaths-2026-11-13/ledger-comparison.json) includes the other 24 comparisons, individual samples, source identities and first-call records. [Run provenance](benchmarks/ledger-fastpaths-2026-11-13/comparison-evidence/completed.json) records the exact command and unchanged input/binary checks. Other task builds were paused during timing; this was still a shared development host, with one-minute load averages 5.95 at the start and 5.36 at the end. Repeat on deployment hardware before selecting routes or setting latency budgets.

### Wider comparison and possible regressions

Ten of the 28 pooled native medians increased. Some session distributions differ enough that a pooled median reverses the direction of both session medians; the [complete audit](benchmarks/ledger-fastpaths-2026-11-13/all-comparison-audit.json) retains these observations rather than filtering them out. The original payroll result was slower in both sessions, so it received a focused repeat after all builds stopped.

That repeat retained 100 samples in each of three fresh sessions for payroll, invoice, short production and bank normalization, with unchanged timing/assertion bodies and 3,708 parity checks. The payroll slowdown did not reproduce: pooled median 0.4555 → 0.4195 ms, with two sessions faster and one flat. Invoice improved in each session. Short production remained mixed, 0.2678 → 0.2713 ms. Bank normalization did show slower medians in all three sessions: pooled 0.3165 → 0.3249 ms, **8.4 microseconds / 2.7% more time**, with individual session increases of 4.2–9.2%.

All four interquartile ranges overlap, which neither proves equivalence nor rules out a regression. Bank normalization remains a possible small-call tradeoff requiring further profiling. The repeat changed preceding workload/GC history and cannot replace the full-28 results. It does not establish a universal speedup or absence of regressions. [Raw repeat](benchmarks/ledger-fastpaths-2026-11-13/focused-repeat.json), [analysis](benchmarks/ledger-fastpaths-2026-11-13/focused-repeat-analysis.json), and [controller/source provenance](benchmarks/ledger-fastpaths-2026-11-13/focused-repeat-evidence/completed.json) retain the exact evidence. Its adapter source is retained under `native/benchmarks/evidence/ledger-fastpaths-2026-11-13/`, outside the standalone SDK.

## What the profile explains

The separate representative phase driver recorded aging calculation CPU at 5.376 → 4.292 ms and allocation calculation at 7.912 → 5.797 ms. Allocation parsing recorded 5.224 → 3.949 ms; aging parsing and result serialization did not show an improvement. These were sequential phase experiments, not the alternating full-service benchmark. They omit protocol framing and host work, and their medians must not be subtracted from the full-service medians to assign savings.

Counter-only runs give stronger evidence of the allocation mechanism:

| Representative request | Runtime `calloc` calls before → after | Managed objects created before → after | Strings created before → after |
| --- | ---: | ---: | ---: |
| Aging, 1,000 rows | 33,051 → 11,059 | 13,765 → 6,480 | 9,811 → 2,526 |
| Allocations, 10,000 events | 59,442 → 30,656 | 29,940 → 20,375 | 19,819 → 10,254 |

Exactly 7,285 and 9,565 formatted temporary strings disappear. Managed peak accounting fell from 6,681,364 to 5,769,356 bytes for aging and from 9,860,130 to 9,054,860 for allocations. These are runtime counters, not total process allocations or RSS. Upstream library allocation is outside these counts; the separate helper instrumentation incurs substantial clock overhead and has overlapping inclusive timings. None of its timings is used as a release-speed result. [Before profile](benchmarks/ledger-fastpaths-2026-11-13/baseline-profile.json) and [after profile](benchmarks/ledger-fastpaths-2026-11-13/candidate-profile.json) retain all samples and diagnostics.

The isolated fixed-conversion kernel improved from 33.843 to 14.025 ms for 100,000 calls, but the full request also parses data, creates objects, accesses fields, sorts, serializes and crosses process boundaries. This explains why a 58.6% kernel reduction cannot be presented as a 58.6% application improvement. ASCII conversion also helps only the applicable input portions. Its middle-Unicode encoding control regressed 5.45%, a documented tradeoff.

The compiler executable grew from 5,783,400 to 5,817,608 bytes; the Ledger worker grew from 1,257,560 to 1,257,816 bytes. This follow-up did not measure a fresh startup or compilation-speed comparison.

Read-only host inspection found remaining work outside this language patch: report preparation normalizes inputs, scans admission size, transfers JSON, validates/subtotals results, shapes rows and sorts groups. Production preview performs 3,000 decimal-backed rounding calls for 1,000 rows, plus input normalization, safe numeric conversions and repeated date validation. Parsing the same normalized schedule start date once is a future application-level candidate. These observations do not establish which host phase dominates; coarse phase profiling and unchanged policy tests should precede such edits.

## Reproduction

The local frozen baseline SDK is `.build/ledger-fastpaths-2026-11-13/baseline-sdk`. The frozen application manifest is retained as [frozen-application.json](benchmarks/ledger-fastpaths-2026-11-13/frozen-application.json). Source and dependency identities are needed to reproduce this exact application comparison; the application itself is not bundled into the language SDK.

```sh
make native-sdk
# Build the unchanged frozen worker into a new directory; do not replace an installed worker.
.build/independent/arya build \
  .build/ledger-fastpaths-2026-11-13/measurement/application/backend/src/arya/native-worker.arya \
  --output /absolute/path/to/new-candidate/ledger-worker --release --force
# Place its matching source/task manifest beside the worker, as recorded in candidate-worker-build.json.
node native/benchmarks/ledger-targets.mjs \
  --app .build/ledger-fastpaths-2026-11-13/measurement/application \
  --native .build/ledger-fastpaths-2026-11-13/measurement/candidate/ledger-worker \
  --baseline-native .build/ledger-fastpaths-2026-11-13/measurement/baseline/ledger-worker \
  --samples 20 --sessions 2 --all true --output /absolute/path/to/new-results.json
make check
make native-clean-test
python3 native/tests/fixed-number-reference.py
python3 native/tests/fixed-number-reference.py --sanitize
```

New output paths are required: benchmark evidence is never silently replaced. `--all false` selects only the four comparisons and changes preceding workload/GC history, so compare backends within that new run. Do not compare it causally with the full-28 run. The [worker build record](benchmarks/ledger-fastpaths-2026-11-13/candidate-worker-build.json) records the exact compilation and manifest provenance.

## Correctness evidence

- The independent Ledger oracle passed 733 cases per time zone in Kabul and Los Angeles against both old and new workers. The sanitizer worker passed a 48-case subset in each zone with collection stress. Five pre-existing out-of-domain Node/native differences are recorded and preserved, rather than silently reported as full compatibility. [Oracle results](benchmarks/ledger-fastpaths-2026-11-13/ledger-reference.json).
- The application's original integration script passed all five tests unchanged in a separate copied fixture, including 813 deterministic cases per zone, relocation, unavailable executable tools in PATH, pool reuse, backend switching, errors, cancellation, queue limits, timeout behavior, 3,000-row report validation and automatic production dispatch. No database was opened. [Integration results](benchmarks/ledger-fastpaths-2026-11-13/ledger-integration.json).
- The combined compiler passed 8,059 independent integer-ratio numeric cases in optimized and reference modes, both release and ASan/UBSan with collection stress. Signed zero and NaN are checked using `Object.is`. [Release oracle](benchmarks/ledger-fastpaths-2026-11-13/fixed-number-integrated-oracle.json), [sanitized oracle](benchmarks/ledger-fastpaths-2026-11-13/fixed-number-integrated-sanitized-oracle.json).
- Focused conversion checks cover 207 language assertions and 19,728 bitwise cases across four rounding modes and a comma locale. UTF conversion checks cover 520 language assertions and 530,860 C checks, including protected page boundaries and allocation/collection ownership. The standalone formatter's independent 3,354-case oracle also passed after extracting its shared coefficient helper. Component guides retain exact commands and evidence.

The standalone worker executes without Node. The surrounding Ledger host application and optional comparison controller still use Node. Sanitizer runs disable leak detection; explicit managed-buffer reclamation checks remain enabled. This run does not qualify other CPU architectures, operating systems, long-lived production load or the entire Ledger API/database path. Optional Python bridges, live MySQL, desktop rendering and editor-host integrations have separate gates and were not rerun for this change.

## Full qualification and delivery

`make native-sdk`, `make native-check`, `make check` and a fresh `make native-clean-test` all passed. The fresh gate rebuilt source and dependencies with Node, other JavaScript engines and Python excluded from its executable search path, reran the native regression/profile/distribution checks, checked extracted SDK hashes, compiled and ran relocated programs, and inspected their dynamic dependencies. The host still has Node installed outside that restricted path. No interpreter removal from the host is claimed.

Stage-two/stage-three generated C matched in both builds. All 188 frozen compiler/runtime/build/library/test source files remained unchanged and matched the fresh workspace. The working compiler and fresh compiler have separate binary identities, recorded with their generated C identities; qualification does not claim bit-for-bit identical builds across different source paths. [Qualification and source hashes](benchmarks/ledger-fastpaths-2026-11-13/qualification.json), [main check log](benchmarks/ledger-fastpaths-2026-11-13/check.log), [clean gate result](benchmarks/ledger-fastpaths-2026-11-13/clean-acceptance.log), [compressed fresh build log](benchmarks/ledger-fastpaths-2026-11-13/clean-verification.log.gz).

The local delivery directory is `artifacts/native-ledger-fastpaths-2026-11-13/`: it contains the standalone SDK, a separate Ledger worker bundle with its matching manifest/notices, and `delivery.json` for archive hashes and post-extraction checks. Existing SDK archives, application sources, installed Ledger worker and production routing are preserved. Rebuild applications with the new compiler or select the new matching worker explicitly to use the change. This remains an unpublished alpha candidate, with the limitations above.
