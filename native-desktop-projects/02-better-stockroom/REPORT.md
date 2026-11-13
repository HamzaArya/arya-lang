# Stockroom: implementation report

Date: 2026-11-13. Developer track is simulated. This is a new native desktop implementation following the user's correction; the earlier browser project was not relabeled as native.

## Actual work

1. Read `../shared/PROTOCOL.md` and the current native Arya worker example. Selected the host/worker interface: command plus JSON arguments, one JSON reply, flat view snapshots and explicit `id`/`version` conflict checks.
2. Implemented `main.arya` with the documented workflows, persistent storage, input validation, loaded-store checks, post-action summaries and user-facing errors. No web/UI/desktop imports or server were added.
3. Created `ui.json` with two native views and action forms, including editable fields loaded from selected rows and destructive-action confirmations.
4. Added `smoke.py` to exercise the real compiled executable in separate processes using an isolated temporary `DATA_FILE`. Tests cover complete operations and edits/deletion, stale versions, invalid input, restart, failed-write rollback and corrupt-state preservation.
5. Both first source checks and sequential release builds completed successfully. Final test outcomes are recorded below after execution. Root integration owns the AppKit host, final `.app` packaging and interactive UI verification.

## Friction and design decisions

- The shared protocol explicitly corrected the worker-build path for this collection to `../../bin/arya`; the project README uses that actual relative path.
- Persistence validation uses strict numeric types for stored IDs/versions while native form strings are accepted at the request boundary.
- Used exact decimal strings for Stockroom prices and valuation. Study Desk duration is a bounded whole number. The apps use built-in filesystem/runtime/date support; no extra SDK or external service was required.
- A request's target view is validated before writing, so an invalid view cannot cause an invisible committed mutation.

## Verification

- `../../bin/arya check main.arya`: passed.
- `../../bin/arya build main.arya -o .build/worker --release --force`: passed.
- `python3 smoke.py .build/worker`: **31 scenarios passed** against the actual native executable.
- `verification.json` identifies the tested source, UI description and worker binary by SHA-256.
- AppKit interaction and packaged-bundle checks are intentionally left to the root integration report; worker acceptance does not claim a GUI test.

No implementation/test failure occurred during this worker's first check/build/acceptance sequence. The report does not invent an error to match a skill-level persona.

## Completion boundary

The scoped application logic and native interface description are implemented. No application was abandoned. No language blocker required leaving a scoped workflow incomplete. Native host behavior and bundle verification belong to root integration and are not claimed by worker tests.

Limits: 1000 live products, 10000 movement records, at most 1000000 units per product. Unit prices allow 12 whole digits and two decimal places. Product descriptions: 4000 characters; movement reasons: 500. Persisted state is capped at 2 MiB. Direct concurrent worker calls, crash/power-loss recovery, cloud sync and non-macOS GUI ports are not included. See the README for the exact functional scope.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification results will follow the migration rebuild.
