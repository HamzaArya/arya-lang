# Incident Center — native desktop work report

## Brief and implemented scope

Pro developer track: build actual native desktop operations software with incident CRUD, ownership, priorities, controlled lifecycle, notes, explicit reopening, service catalogue and activity timeline. All workflows are implemented in Arya. The shared Objective-C AppKit host renders native controls according to `ui.json`; this worker imports filesystem/environment/runtime modules only. This is a simulated developer brief, not a human usability study.

## Work performed

1. Read the shared worker/host contract before implementing commands and flat id/version snapshots.
2. Created three native views and nine actions, with selection-aware edit dialogs and dynamic service choices. Services show linked active-incident counts; incidents show the whole timeline in their detail pane.
3. Implemented schema and per-record validation, bounded data, atomic save-before-success, optimistic versions and dependency-aware deletion. Deleting incidents/services preserves their activity entries.
4. Implemented and tested new → edit → note → investigate → resolve → reopen → resolve → delete across separate worker processes. Tested linked-service protection, stale versions, corrupt state and filesystem write failure.
5. Reviewed input boundaries: the first service-created event included the whole description plus a prefix, potentially exceeding the event's 2,000-character limit even when the description itself was valid. Kept that timeline event concise and added a maximum-description regression.
6. Grouped activity by entity once per snapshot so large boards do not scan the entire timeline separately for every incident.
7. Built native release workers sequentially. Initial checks/builds and the first 29-command test pass succeeded. The final pass includes additional boundary coverage and source hashes in `verification.json`.

## Friction, limits and abandonment

The existing browser-oriented Arya UI modules do not satisfy this native AppKit requirement. The root integration therefore supplies the native controls host; this worker contains no HTTP, HTML, WebKit or UI-module calls. Dynamic optional service selection needed a blank/Unassigned choice and was coordinated with the host implementation.

Native compilation emitted the repository runtime's existing macOS `ucontext` deprecation warnings; builds completed successfully. No compiler/runtime files were changed. No intended bounded workflow was abandoned. Limits, manual service health, single-store operation and durability boundaries are explicit in README.

## Verification boundary

`verification.json` records check/build/smoke results, source/test/UI hashes and the final worker hash. The automated controller launches a new process per operation, so persistence is exercised throughout. Actual native-window interaction and final `.app` packaging are verified by root integration and recorded in the collection report; worker tests alone do not claim GUI verification.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.
