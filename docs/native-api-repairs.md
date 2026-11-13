# Application-reported native API repairs

This work follows the recorded findings in `developer-projects/REPORT.md`, `native-desktop-projects/REPORT.md`, and `native-calculators/REPORT.md`. It changes library contracts and runtime APIs, rather than claiming that application workarounds fix the language.

## Reproduction and diagnosis

1. `decimal.quantize("1.25", 2)` passed `arya check` in an unannotated program. Adding `const typed: boolean = true` made the same call fail with `ARYA_TYPE`, as the existing signature requires all three arguments. This is the documented gradual typing boundary: unannotated programs remain dynamic. The runtime did have a misleading error: the missing rounding argument was reported as invalid decimal places.
2. The original small server-options probe did not reproduce the reported error because it was unannotated. With checking activated, both an inferred options variable and an object containing `process.cwd()` failed structural compatibility. The contracts incorrectly described optional writable fields, although `web.serve`, `health`, and `shutdown` only read the option fields. The fix uses the existing readonly input-record contract; wrong field types still fail.
3. `std fs` exposed text read/write functions but no public byte read/write API. Text decoding cannot preserve arbitrary binary files. Native `Buffer` storage already existed and could support bounded, lossless filesystem operations.
4. Application reports also exposed predictable `.tmp` staging and dangling-symlink bugs. The applications had been individually repaired. Reusable atomic replacement operations now remove the need to reproduce that staging sequence in each new application.

Before-edit hashes and copies are under `.build/language-api-repairs/before.json` and `.build/language-api-repairs/before/`; checker reproduction output is in `.build/language-api-repairs/before-checks.json`. These local diagnostics are regenerable build artifacts. Most compiler/runtime files were already modified before this task; only the narrow changes described below belong to this repair.

## Changes

- Decimal strings and parsed decimal values now report `ARYA_DECIMAL_ROUNDING` when rounding is missing/invalid, and retain `ARYA_DECIMAL_PLACES` for invalid/missing places. Explicit rounding requirements and dynamic-language behavior are preserved.
- `web.serve`, `health`, and `shutdown` accept valid inferred readonly option records without `any` assertions. The general mutable-record variance rules are unchanged.
- `fs.readBytes`, `writeBytes`, and `appendBytes`, plus their explicit `Sync` variants, operate on native `Buffer` values. Reads are bounded to 16 MiB; invalid binary writes reject before opening/truncating a destination. Native workers own copied C buffers and create managed results on the runtime thread.
- `fs.writeTextAtomicSync` and `writeBytesAtomicSync` use exclusive random sibling files, verify writes and close, reject existing/dangling destination symlinks and nonregular files, and atomically rename the completed file. Ordinary failures remove the staging file. The byte cap is 16 MiB and replacements have mode `0600`.

Atomic visibility is not power-loss durability: these APIs do not call `fsync`. They do not preserve metadata or coordinate concurrent writers. A symlink in a parent directory is not rejected; only the final destination entry is checked. These are explicit limits, not a claim of a transaction system or filesystem sandbox.

## Verification

`python3 native/tests/api-contracts.py` checks typed positive/negative examples and unannotated compatibility. It builds optimized and reference (`--no-data-opt`) binaries with ASan/UBSan, runs GC stress, compares exact bytes with a Python oracle, tests invalid UTF-8/NUL/subarray buffers and concurrent reads, checks 16 MiB boundaries and OS errors, and forces a partial staging write using `RLIMIT_FSIZE` to verify that the original store survives and staging files are removed. Fixed `.tmp` links, real and dangling destination symlinks, directories, missing parents and invalid inputs are covered.

On 2026-11-13, `make native` passed all bootstrap stages and the generated-C fixed-point comparison (`stage2.c` equals `arya.c`). `python3 native/tests/api-contracts.py` passed all 17 typed checks, dynamic compatibility, both native optimized/reference builds, independent byte checks, and the sanitizer/GC-stress and forced-write-failure cases on macOS arm64. Logs are `.build/language-api-repairs/bootstrap.log` and `.build/language-api-repairs/tests.log`. Qualification is limited to this host; these changes do not establish Windows/Linux GUI qualification.

## Files owned by this repair

- `native/compiler/standard-types.arya`: only fs members and web option contracts.
- `native/runtime/core.c`: only fs dispatch, fs exports and the atomic helper include.
- `native/runtime/fs-worker.c`: binary operations and shared synchronous/worker execution.
- `native/runtime/fs-atomic.c`: new synchronous atomic replacement helper.
- `native/runtime/decimal.c`: missing-rounding diagnostics in string/parsed paths.
- `native/tests/api-contracts.py` and `native/tests/fixtures/api-contracts.arya`: new regression suite.
- `native/manifest.json`: only added fs members.
- `docs/standard-library.md`: fs contracts and decimal/web clarification.
- This report.

Compiler/checker/type-model algorithms were not edited. Native widgets, security hashing, version metadata and release tooling are separately owned work. No commits were made by this repair task.
