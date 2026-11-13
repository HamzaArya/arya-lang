# Harbor Support: developer report

Date: 2026-11-13. Track: 03-intermediate. This is an AI-simulated developer exercise, not a claim that a human developer performed the work.

## Intended result

Manage a small local support queue with customer ownership, Normal/Urgent priority, descriptions, triage columns, deletion, and revision conflicts.

## Work record

1. Read native language/SDK standard-library contracts and the native project creator. Selected native Arya modules for the application, with a Python-only integration driver.
2. Implemented the domain operations, input validation and explicit error behavior. Added standalone build/run documentation.
3. Ran `arya check main.arya`; corrected issues described below.
4. Built `--release` and ran `python3 smoke.py .build/app`; actual result is appended after the run.

## Friction and decisions

The standard ui action model supports server requests and bound feedback, but this implementation uses server-rendered cards. Chose an explicit Refresh board link rather than claiming automatic reactive card updates.

Native builds emit existing macOS `getcontext`, `makecontext`, and `swapcontext` deprecation warnings from the runtime. These do not by themselves fail the build; no runtime/compiler files were changed.

The first HTTP test used an executable compiled before the priority field was added. The old request schema correctly rejected the new field. A fresh build of the final source resolved this test/build coordination issue.

Cross-track review found that `web.serve` resolves its root even when static files are disabled. Set `root: process.cwd()` explicitly so a moved executable does not require its original source directory to exist. The default source-relative behavior was confirmed in `native/libraries/web.arya`.

The complete app's checker rejected a fresh server-options record after adding the valid `root` property, reporting visually compatible expected/received types. A minimal isolated `web.serve` example did pass; the exact compiler cause was not established. The workaround declares this hardcoded options record `any` at the library boundary. `web.serve` continues to validate the actual option values at runtime. The language/compiler issue remains unresolved; application building is unblocked.

The first final-source GUI request returned HTTP 500 (`ARYA_UI`): `ui.select` expects `{value, label}` records, not strings. Replaced the priority options with the required shape. The regression test fetches the rendered page, which checking alone had not exercised.

## Boundaries / where a developer would stop

Single local operator; no login, email delivery, attachments, SLA clock, or shared-process writes. Board limited to 200 tickets. Browser UI uses Arya ui-generated JavaScript for request actions; native Arya owns the app and storage. Refresh is explicit.

The app remains implemented within this stated scope. No app has been abandoned. Features beyond these boundaries are explicitly deferred, not reported as completed.

## Verification evidence

Final native check, release build and integration smoke test passed on macOS ARM64. The evidence records compiler/SDK and input hashes.

- [Machine-readable run](../../reports/20261113T133254.839934Z/results.json).
- [check output](../../reports/20261113T133254.839934Z/03-intermediate--gui-support-desk--check.log): exit 0.
- [build output](../../reports/20261113T133254.839934Z/03-intermediate--gui-support-desk--build.log): exit 0.
- [smoke output](../../reports/20261113T133254.839934Z/03-intermediate--gui-support-desk--smoke.log): exit 0.

Native app code and integration-test hashes match the final run. The browser interaction review is coordinated by the root agent and reported separately; HTTP page rendering is included in GUI smoke tests. No application was abandoned.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.

The old `serverOptions: any` workaround was removed: the repaired native web input contract accepts the inferred record while retaining field validation. The migration check/build exercises this against the actual application.
