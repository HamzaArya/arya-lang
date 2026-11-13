# Programmer Calculator: developer report

Date: 2026-11-13. AI-simulated developer track; no invented human developer or testing session.

## Work

Read the native calculator protocol, implemented an explicit bounded expression parser, arithmetic/domain checks, persistent results/history and native keypad/option configuration. Added real native-process tests with independent Python reference results and checks for invalid-input preservation, corruption and failed writes. Runtime application code is Arya; AppKit supplies the native face. Python is testing/build tooling only.

## Actual friction

- The first scientific check rejected a helper named `function`, a reserved token. Renamed it `applyFunction`.
- Mutually recursive parser return inference included undefined. Explicit numeric return annotations and explicit error returns resolved the native checker errors without compiler changes.
- The filesystem filled before test/build logs could be written. Compilation paused; the coordinating agent recovered space only from generated intermediates and serialized builds. No app was abandoned.
- A generic `/tmp` generator name collided with another agent's earlier script when an overwrite failed for lack of space. The existing script then ran and attempted a beginner-test write, also failing. The coordinating agent verified those test-file hashes unchanged. Subsequent test generation wrote only these owned directories directly.

Independent review found that stored history result strings were only structurally checked, allowing `NaN` to appear in history even when last result/memory were valid. Each history result now passes the calculator's numerical-domain validation; regression cases also verify rejected corrupt files remain byte-for-byte unchanged. Both engines were rebuilt and their complete suites rerun after these fixes.

## Scope and stopping points

All implemented arithmetic semantics and limits are specified in [README.md](README.md). Scientific arithmetic is binary64 real arithmetic; programmer arithmetic is exact bounded UInt32. Neither claims arbitrary precision, symbolic algebra or complex arithmetic. GUI verification is performed separately by the coordinating native AppKit host task. No app has been abandoned.

## Verification

Final native checking, release builds, and reference/integration tests all passed. [verification.json](verification.json) records compiler, source, form configuration, test and worker hashes. Retained logs: [check](evidence/check.log), [build](evidence/build.log), [smoke](evidence/smoke.log). Tests execute a separate native process for each operation and verify invalid operations and read-only-parent write failures leave saved bytes unchanged. Native GUI interaction testing belongs to the collection host report and is not inferred from engine tests.

The programmer suite includes 18 named cases and 280 deterministic Python integer reference comparisons across arithmetic, bit operations and shifts. Full-width multiplication agrees with exact Python integers after modulo 2³². Arya has no source bitwise operators, so explicit arithmetic bit loops implement the documented model.
