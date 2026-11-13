# Harbor Support Desk: native application developer report

Date: 2026-11-13. This is an AI-simulated developer track; no human developer or tester is invented.

## Delivered scope

The project supplies an Arya command worker and native AppKit form/table configuration. The shared host supplies the actual native GUI and bundles. App logic and persistence never use HTTP, HTML, std ui, desktop web views, Node or Python. Read [README.md](README.md) for the concrete finished features and limits. Native host behavior and graphical interaction testing are reported by the coordinating agent separately.

## Work record

1. Read the native worker protocol and specified complete domain workflows rather than reusing the earlier browser app.
2. Implemented commands, complete edit forms, deletion, lifecycle rules, stale revision checks, multiple views and bounded event history.
3. Added strict startup schemas, file-size/row limits, domain integrity checks and private staging before replacement.
4. Added actual multi-process executable integration checks for CRUD, validation, stale revisions, lifecycle, persistence, corrupt data and failed writes.
5. Ran native checking, release builds and smoke tests; final results follow below.

## Actual friction

The first check rejected the JavaScript-style `typeof` token. Arya's supported `std runtime.kind` replaces it. Both workers then passed the native checker. No compiler or runtime source was changed.

A final source review corrected the persisted-byte boundary to include the trailing newline. Both workers were rebuilt and retested after that correction.

Native builds may emit existing macOS ucontext deprecation warnings from the runtime. They are not evidence of a failed application build.

## Where work stops

No application has been abandoned. Platform scope is native AppKit on macOS ARM64. Cloud collaboration, authentication and external integrations are beyond these local apps' stated scope. Store size and row/history limits are explicit in the README. Atomic replacement is implemented; fsync/power-loss durability is not claimed.

## Verification

Final native check, release build and all worker integration tests passed. [verification.json](verification.json) records source, form configuration, test, compiler and worker hashes. Retained logs: [check](evidence/check.log), [build](evidence/build.log), [smoke](evidence/smoke.log). Tests use separate native processes and isolated stores; they include read-only-parent write failures, corrupt storage, and preservation of the previous data file. The coordinating agent packages the AppKit host and performs native GUI interaction QA separately. No graphical interaction result is inferred from worker tests.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.
