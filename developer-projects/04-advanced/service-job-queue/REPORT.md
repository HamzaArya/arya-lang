# Workline Queue: developer report

Date: 2026-11-13. Track: 04-advanced. This is an AI-simulated developer exercise, not a claim that a human developer performed the work.

## Intended result

Coordinate local workers with durable jobs, idempotent submission, expiring claims, stale-lease rejection, completion/failure and explicit retries.

## Work record

1. Read native language/SDK standard-library contracts and the native project creator. Selected native Arya modules for the application, with a Python-only integration driver.
2. Implemented the domain operations, input validation and explicit error behavior. Added standalone build/run documentation.
3. Ran `arya check main.arya`; corrected issues described below.
4. Built `--release` and ran `python3 smoke.py .build/app`; actual result is appended after the run.

## Friction and decisions

The checker models JSON.stringify as string | undefined. The internal deep snapshot now uses an explicit fallback; normal validated array data always serializes. Persistence publishes before replacing live memory, so failed writes do not acknowledge or apply state transitions.

Native builds emit existing macOS `getcontext`, `makecontext`, and `swapcontext` deprecation warnings from the runtime. These do not by themselves fail the build; no runtime/compiler files were changed.

Cross-track review found that `web.serve` resolves its root even when static files are disabled. Set `root: process.cwd()` explicitly so a moved executable does not require its original source directory to exist. The default source-relative behavior was confirmed in `native/libraries/web.arya`.

The complete app's checker rejected a fresh server-options record after adding the valid `root` property, reporting visually compatible expected/received types. A minimal isolated `web.serve` example did pass; the exact compiler cause was not established. The workaround declares this hardcoded options record `any` at the library boundary. `web.serve` continues to validate the actual option values at runtime. The language/compiler issue remains unresolved; application building is unblocked.

## Boundaries / where a developer would stop

Local worker protocol, not an arbitrary command runner. No built-in worker executes submitted task text. 1000-job cap, no deletion/history compaction, no lease heartbeat. Delivery is at least once: expired claims can repeat external work, so worker effects must be idempotent. Wall clock controls leases. No multi-process writers or distributed consensus.

The app remains implemented within this stated scope. No app has been abandoned. Features beyond these boundaries are explicitly deferred, not reported as completed.

## Verification evidence

Final native check, release build and integration smoke test passed on macOS ARM64. The evidence records compiler/SDK and input hashes.

- [Machine-readable run](../../reports/20261113T133508.368270Z/results.json).
- [check output](../../reports/20261113T133508.368270Z/04-advanced--service-job-queue--check.log): exit 0.
- [build output](../../reports/20261113T133508.368270Z/04-advanced--service-job-queue--build.log): exit 0.
- [smoke output](../../reports/20261113T133508.368270Z/04-advanced--service-job-queue--smoke.log): exit 0.

Native app code and integration-test hashes match the final run. The browser interaction review is coordinated by the root agent and reported separately; HTTP page rendering is included in GUI smoke tests. No application was abandoned.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification results will follow the migration rebuild.
