# Reading Shelf API: developer report

Track: 02-better. Date: 2026-11-13. Role is simulated; all commands and observed outcomes below came from actual work in this repository.

## Work log

1. Read native project templates, library catalog and web/UI implementation to establish the current Arya syntax and APIs. Confirmed `./bin/arya --version`: `Arya native 2.0.0-alpha.3 (self-hosted)`.
2. Scoped the project around this usable workflow: Save HTTP(S) bookmarks with tags, find them by title/URL or tag, update entries and prevent duplicate URLs.
3. Implemented `main.arya`, validation, persistent JSON state, bounded input and explicit errors. State writes use a temporary file plus rename. Added `arya.json`, local generated-file exclusions and run/build instructions.
4. Added `smoke.py` to invoke the real compiled executable in isolated temporary directories. CLI tests launch new processes for persistence; HTTP tests stop/restart the server against the same store. Tests exercise successful and invalid input, deletion, corrupt-file protection and graceful HTTP shutdown where applicable.
5. All six first source checks passed. Release builds and final acceptance outcomes are recorded below after execution.

## Friction and decisions

- The public catalog identifies modules but some detailed built-in signatures required reading the compiler standard-type table and native fixtures. In particular, filesystem exports are native built-ins, not `native/libraries/fs.arya`.
- Chose a browser GUI through `std ui` and `std web` for GUI apps, consistent with the current native project template. Their state updates use supported UI request bindings and show saved records immediately.
- Single-process file persistence fits this track. Multi-process locking and a database were not required for these local workflows and are explicitly outside the delivered scope.

## Verification

- `arya check main.arya`: passed for the first implementation and the final source.
- `arya build main.arya -o .build/app --release --force`: passed. macOS SDK compilation emits existing deprecated `ucontext` warnings; these did not prevent the release build.
- `python3 smoke.py .build/app`: passed against the development release executable. Tests cover the documented primary workflow, rejected input, persistence and malformed-store preservation.
- The final review tightened UTF-8 snapshot limits using `Buffer.byteLength` instead of string character count. Root integration rebuilds and retests final sources; the authoritative final source/binary hashes, commands and output logs are in `../../reports/`.
- HTTP tests also check server restart and SIGTERM shutdown. Final source explicitly sets `web.serve` root to the current working directory; source inspection found that the default resolves the original source directory even with assets disabled. This removes that avoidable deployment dependency; a missing-original-source deployment was not separately simulated.


## Where work stopped

No app was abandoned and no compiler limitation prevented the scoped workflow. Unsupported expansion: URLs must use HTTP or HTTPS and cannot include embedded credentials. URLs are normalized by Arya URL before duplicate comparison. Tags match case-sensitively; search is case-insensitive. The service does not fetch remote pages. POST returns 201; invalid data and unknown IDs return 400; unknown routes return 404.

Production deployment, other operating systems, power-loss simulation and multi-process writes were not tested. Automated HTTP checks are distinct from interactive browser checks; root integration records any browser QA separately.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification results will follow the migration rebuild.
