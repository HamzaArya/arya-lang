# Signal Log: developer report

Date: 2026-11-13. Track: 03-intermediate. This is an AI-simulated developer exercise, not a claim that a human developer performed the work.

## Intended result

Summarize JSONL application logs by severity and service, count invalid input lines, and calculate average and nearest-rank p95 latency.

## Work record

1. Read native language/SDK standard-library contracts and the native project creator. Selected native Arya modules for the application, with a Python-only integration driver.
2. Implemented the domain operations, input validation and explicit error behavior. Added standalone build/run documentation.
3. Ran `arya check main.arya`; corrected issues described below.
4. Built `--release` and ran `python3 smoke.py .build/app`; actual result is appended after the run.

## Friction and decisions

Initial check rejected nullable `args[0]` at the filesystem boundary despite argument-count checks. Explicit `?? ""` makes the expected string contract visible. No compiler change was needed.

Native builds emit existing macOS `getcontext`, `makecontext`, and `swapcontext` deprecation warnings from the runtime. These do not by themselves fail the build; no runtime/compiler files were changed.

## Boundaries / where a developer would stop

Whole-file processing, 16 MiB limit; intended for local investigation, not live tailing. No timestamps or arbitrary log formats are inferred. Stateless by design.

The app remains implemented within this stated scope. No app has been abandoned. Features beyond these boundaries are explicitly deferred, not reported as completed.

## Verification evidence

Final native check, release build and integration smoke test passed on macOS ARM64. The evidence records compiler/SDK and input hashes.

- [Machine-readable run](../../reports/20261113T132927.563792Z/results.json).
- [check output](../../reports/20261113T132927.563792Z/03-intermediate--cli-log-analyzer--check.log): exit 0.
- [build output](../../reports/20261113T132927.563792Z/03-intermediate--cli-log-analyzer--build.log): exit 0.
- [smoke output](../../reports/20261113T132927.563792Z/03-intermediate--cli-log-analyzer--smoke.log): exit 0.

Native app code and integration-test hashes match the final run. The browser interaction review is coordinated by the root agent and reported separately; HTTP page rendering is included in GUI smoke tests. No application was abandoned.
