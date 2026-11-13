# Flowboard: developer report

Date: 2026-11-13. Track: 04-advanced. This is an AI-simulated developer exercise, not a claim that a human developer performed the work.

## Intended result

Plan release work in Backlog/Doing/Done columns with assignees, descriptions, durable records, revision conflicts and a three-task work-in-progress limit.

## Work record

1. Read native language/SDK standard-library contracts and the native project creator. Selected native Arya modules for the application, with a Python-only integration driver.
2. Implemented the domain operations, input validation and explicit error behavior. Added standalone build/run documentation.
3. Ran `arya check main.arya`; corrected issues described below.
4. Built `--release` and ran `python3 smoke.py .build/app`; actual result is appended after the run.

## Friction and decisions

Server-rendered cards need explicit refresh in this implementation. Added a visible refresh link and result messages. WIP and revision policies remain in Arya on the server so direct API calls obey the same rules.

Native builds emit existing macOS `getcontext`, `makecontext`, and `swapcontext` deprecation warnings from the runtime. These do not by themselves fail the build; no runtime/compiler files were changed.

While adding the WIP regression test, a broad text replacement also modified a Python function definition. `py_compile` caught the syntax error before a test could pass; the driver was corrected and rerun. This was a test-authoring error, not an Arya runtime failure.

Cross-track review found that `web.serve` resolves its root even when static files are disabled. Set `root: process.cwd()` explicitly so a moved executable does not require its original source directory to exist. The default source-relative behavior was confirmed in `native/libraries/web.arya`.

The complete app's checker rejected a fresh server-options record after adding the valid `root` property, reporting visually compatible expected/received types. A minimal isolated `web.serve` example did pass; the exact compiler cause was not established. The workaround declares this hardcoded options record `any` at the library boundary. `web.serve` continues to validate the actual option values at runtime. The language/compiler issue remains unresolved; application building is unblocked.

One final verification run passed check/build but exceeded the integration driver's five-second startup readiness window. An immediate identical test run passed in 0.55 seconds, and a second captured smoke rerun also passed. The precise transient cause was not established. The final evidence is an explicit resumed-smoke record: it references the original successful check/build logs and preserves the failed first attempt. Source and binary hashes were checked unchanged before resuming.

## Boundaries / where a developer would stop

Single local operator, 200 tasks, no login, drag-and-drop, realtime collaboration or external issue sync. Uses native Arya web/ui and the browser; no Node/Python backend. Explicit refresh after mutations.

The app remains implemented within this stated scope. No app has been abandoned. Features beyond these boundaries are explicitly deferred, not reported as completed.

## Verification evidence

Final native check, release build and integration smoke test passed on macOS ARM64. The evidence records compiler/SDK and input hashes.

- [Machine-readable run](../../reports/20261113T134135.634563Z/results.json).
- [check output](../../reports/20261113T133508.368270Z/04-advanced--gui-project-board--check.log): exit 0.
- [build output](../../reports/20261113T133508.368270Z/04-advanced--gui-project-board--build.log): exit 0.
- [smoke output](../../reports/20261113T134135.634563Z/04-advanced--gui-project-board--smoke-resumed.log): exit 0.

Native app code and integration-test hashes match the final run. The browser interaction review is coordinated by the root agent and reported separately; HTTP page rendering is included in GUI smoke tests. No application was abandoned.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.

The old `serverOptions: any` workaround was removed: the repaired native web input contract accepts the inferred record while retaining field validation. The migration check/build exercises this against the actual application.
