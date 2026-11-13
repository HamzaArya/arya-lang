# Exact journal preparation: local reliability and performance pass

This is a bounded follow-up on a frozen dirty `2.0.0-alpha.3` worktree at Git HEAD `28d27826ae74386dc81a652d24752409c6e2fb6a`. It is **not a release qualification**. The existing alpha.2 results and alpha.3 qualification files remain unchanged. The [baseline manifest](benchmarks/journal-preparation-2026-11-13/baseline-source.json), [isolated implementation patch](benchmarks/journal-preparation-2026-11-13/implementation.patch), and [changed-source identities](benchmarks/journal-preparation-2026-11-13/changes.json) identify the tested work separately from other edits in this checkout.

## What changed

The initial diagnostic found that validating 1,000 two-posting transactions consumed roughly 19–22 ms of process CPU, while preparing their flattened ledger took under 1 ms. That short diagnostic overlapped unrelated builds: it justified investigating repeated work, not a speedup claim. Its [source](benchmarks/journal-preparation-2026-11-13/profile-before.arya) and [raw output](benchmarks/journal-preparation-2026-11-13/profile-before.jsonl) are retained.

`prepareJournal` previously parsed and prepared each transaction, calculated/formatted its entire account report, checked posting policy using decimal-string comparisons, flattened the caller's entries, and parsed/prepared them again. It now keeps each validated native snapshot, checks posting positivity and totals directly in checked minor units, and combines native rows while remapping account IDs. The final batch owns its row storage and account-name references. No amount passes through binary64; ledger rows remain bounded signed 64-bit minor units and aggregates use signed 128-bit intermediates. The maximum row count bounds those sums. Invoice rounding code is unchanged.

Policy and transaction validation retain their established order: options are checked even for an empty journal; duplicate IDs and accumulated row limits precede the affected transaction's rows; all native row validation precedes posting policy; each transaction must balance independently. Error codes, messages, row indices, transaction indices and unbalanced differences match the frozen baseline in the invalid-input differential cases. Final account-limit errors retain their global posting offsets. Account order remains first posting occurrence, including Unicode, NUL and special property-name tags. Frozen summaries, snapshot behavior, asynchronous calculation, cancellation and backpressure remain covered.

Calculation closures are constructed in a small helper scope. Optimized release compilation already prunes unused captures; the optimization-disabled reference path previously retained the full preparation scope. A retained 2,002-row single-transaction journal grew managed memory by **3,197,712 bytes** in that baseline reference build and **58,218 bytes** after the change. Optimized release retained **48,012 bytes** both before and after. The [baseline reference failure](benchmarks/journal-preparation-2026-11-13/lifetime-baseline-reference.log) and [new regression output](benchmarks/journal-preparation-2026-11-13/journal-tests.log) preserve that distinction.

## Final measurement

The optional `native/benchmarks/journal.py` controller builds the same workload with two supplied SDKs, then measures in a separate step. It refuses an existing evidence directory, compiler/stdlib/library/source/binary drift, an already-started timing directory, another cooperating timing controller, and detected compiler/build/benchmark processes. It records raw samples as they finish. These guards do not prove an otherwise idle machine.

Host: macOS 26.5.2, ARM64, eight logical CPUs; Apple Clang 21.0.0. Release applications use C11 `-O2 -ffp-contract=off`. The [artifact record](benchmarks/journal-preparation-2026-11-13/final/artifacts.json) identifies compilers, adjacent standard libraries and native libraries, workload/oracle/controller sources, generated C, binaries, exact build commands and toolchain version.

Each backend used one persistent process per session. Two sessions retained nine samples after three warmups for each of three shapes and five operations, alternating backend order. The 540 retained samples, 180 warmups and two separate counter runs all matched the complete independent Python integer oracle. Results below use the conventional median of 18 retained samples per operation/backend, not the nearest-rank median used by some historical Ledger controllers.

| Workload | Operation | Before CPU ms | After CPU ms |
| --- | --- | ---: | ---: |
| 10 transactions × 2 rows | Prepare journal | 0.1185 | 0.0790 |
| Same | Calculate prepared journal | 0.0120 | 0.0160 |
| Same | Prepare + calculate | 0.1170 | 0.0895 |
| 1,000 transactions × 2 rows | Prepare journal | 12.9550 | 6.8250 |
| Same | Calculate prepared journal | 0.0360 | 0.0425 |
| Same | Prepare + calculate | 13.8105 | 7.5935 |
| 20 transactions × 100 rows | Prepare journal | 1.6650 | 0.3190 |
| Same | Calculate prepared journal | 0.0315 | 0.0340 |
| Same | Prepare + calculate | 1.6165 | 0.3545 |

Preparation improved in both sessions for each shape. These local observations show 47.3% less preparation CPU for the 1,000-transaction shape and 80.8% less for the wider transactions. Already-prepared calculation medians were 2.5–6.5 microseconds higher. That small-call tradeoff is retained, not presented as a gain; a longer repeated-calculation experiment is needed to quantify it. Separate operations have independent GC and sample histories, so their medians should not be added.

The [complete results](benchmarks/journal-preparation-2026-11-13/final/results.json) and [sample log](benchmarks/journal-preparation-2026-11-13/final/samples.jsonl) also retain validation-only and flattened-ledger preparation, individual samples, spread, input parse/setup CPU and host encoding/decoding. One-minute load averages were 5.91 and 5.32 at the run's start and end. Competing builds were absent according to the process guard, but this remained a shared development host. No statistical significance or deployment-hardware result is claimed.

## Boundaries and limitations

- **Application compilation:** recorded separately in build JSON files. These are individual builds, not a compilation-speed study. Compiler bootstrap is outside this interval.
- **Cold readiness:** process launch through runtime/module initialization and a ready line, before calculations. First-session before/after values were 713/754 ms, versus 4.71/4.80 ms in the next session. These large first-launch effects and two samples per backend support no startup-speed conclusion.
- **Warmed operations:** process CPU excludes parsing, setup, pipes and output serialization. Preparation modes calculate the full report after the timed interval so every result can still be checked. Natural GC within the operation is included.
- **IPC/JSON:** persistent-worker wall samples include input transfer/parse, setup, operation, report materialization, output JSON and response reading. Host encode/decode is separate. In `calculate` mode, a journal is prepared in setup before each timed calculation; its round trip therefore does not represent repeated use of an existing batch.
- **Allocation and memory:** separate instrumented runs for the 1,000-transaction shape recorded requested runtime bytes falling from 23,479,253 to 17,208,708 and heap objects from 64,232 to 36,236. Peak managed bytes rose from 7,005,448 to 7,097,602, about 1.3%. These counters include input parsing, setup and output work; they are not RSS or uninstrumented speed timings. Live retained-memory growth is the separate lifetime regression above.
- **Not measured:** concurrent or sustained throughput, RSS, a full application/database service, Node/JavaScript or PHP implementations, and other platforms. Ordinary `Number` remains binary64. Existing Ledger results measure different boundaries and remain separate historical evidence.

## Verification and reproduction

The native journal suite now checks release, optimization-disabled reference, and ASan/UBSan with GC stress; exact public result/type contracts; error precedence; immutable snapshots; closure lifetime; native storage/name ownership; the 100,000-account boundary; the accumulated row limit; and tracked-memory reclamation. The optional independent oracle covers 175 valid journals, 12,358 posting rows, scales 0–6, maximum signed-row amounts and wider aggregate totals, plus 37 invalid inputs. Release errors also match the frozen baseline completely. Sanitizer leak detection was disabled; the native probe explicitly checks full tracked-runtime reclamation.

Passed in the isolated candidate snapshot:

- `make native`, including identical stage-two/stage-three generated C.
- `sh native/tests/accounting-journal.sh` — [output](benchmarks/journal-preparation-2026-11-13/journal-tests.log).
- `python3 native/tests/accounting-journal-reference.py --baseline-compiler BEFORE/arya --mode release` — [oracle/parity evidence](benchmarks/journal-preparation-2026-11-13/oracle-release.json).
- `python3 native/tests/accounting-journal-reference.py --mode sanitized` — [oracle evidence](benchmarks/journal-preparation-2026-11-13/oracle-sanitized.json).
- `python3 native/tests/accounting-reference.py` — 85 existing independent invoice/ledger batches, 7,600 rows, all established scales and nine rounding modes; [output](benchmarks/journal-preparation-2026-11-13/accounting-oracle.log).
- Existing accounting fixture in release and ASan/UBSan with GC stress, including cancellation/backpressure; [release](benchmarks/journal-preparation-2026-11-13/legacy-accounting-release.log), [sanitized](benchmarks/journal-preparation-2026-11-13/legacy-accounting-sanitized.log).
- `sh native/tests/run.sh` — core, relocation, financial bridge and sanitizer checks; [output](benchmarks/journal-preparation-2026-11-13/core-tests.log). The initial sandbox attempt stopped because Clang could not create temporary files in the deliberately empty environment. The unchanged suite passed outside the sandbox. This suite ran before the final journal closure helper; the final journal suite and oracles were repeated after that helper.
- `python3 native/tests/journal-benchmark-guards.py` — four evidence-preservation, drift and contention checks; [output](benchmarks/journal-preparation-2026-11-13/benchmark-guards.log).
- Final benchmark identities, all 722 independent result checks, and no detected competing build/benchmark process.

Example commands, using separate frozen before/after SDKs and a fresh output directory:

```sh
python3 native/benchmarks/journal.py build \
  --before-compiler /absolute/before/arya \
  --after-compiler /absolute/after/arya \
  --out /absolute/new-evidence-directory
python3 native/benchmarks/journal.py measure \
  --out /absolute/new-evidence-directory --samples 9 --sessions 2
```

The native journal suite remains part of `make native-test`/`make check`, without adding Python or Node to required native acceptance. The Python controllers are optional development tools. A complete final-source `make check`, clean-source/distribution qualification and multi-platform qualification are outside this pass. Existing candidate/versioning work is preserved; historical results do not qualify the newly changed source. Wider library coverage, debugger tooling, a package registry and persistent accounting business rules remain separate work.

After guarded application of the 12 implementation/test/controller files, the **original checkout** was rebuilt with `make native` and again produced identical stage-two/stage-three C. Its journal suite and independent sanitized oracle (175 valid and 37 invalid cases) passed. See the [integration build log](benchmarks/journal-preparation-2026-11-13/original-build.log), [journal integration log](benchmarks/journal-preparation-2026-11-13/original-journal-tests.log), [oracle evidence](benchmarks/journal-preparation-2026-11-13/original-oracle.json), and [verification inventory](benchmarks/journal-preparation-2026-11-13/verification.json). The measured binaries belong to the isolated snapshot; the original checkout's rebuilt compiler is separately identified in that inventory and was not retimed. No deployment, publication, push, version bump, Ledger modification or real accounting-data operation was performed.
