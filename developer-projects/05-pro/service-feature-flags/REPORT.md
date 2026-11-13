# Feature flag service — work report

## Developer brief

Simulated 05-pro track. Build a usable service application in native Arya. Maintain named flags with enable switches, percentage rollout and optimistic versions. Evaluate a stable subject/key bucket so the same subject receives consistent treatment. Updates reject stale versions.

## Work log (2026-11-13)

1. Read the repository language/SDK catalog, native project creator, filesystem type contracts, and UI implementation where applicable.
2. Implemented the domain workflow directly in `main.arya`, with bounded input, explicit errors and exact decimal strings where needed.
3. Native `arya check main.arya` passed on the first complete implementation for all six apps in these two tracks.
4. Added executable integration tests instead of tests that only repeat helper implementation. Added example input for CLI tools and commands/API contracts for users.
5. Root review identified an important persistence gap before delivery: initial stores only checked the outer array. Stateful implementations now validate individual records on startup and reject a store that the app could not later read. Store writes are bounded to the same 1 MiB read cap. Failed writes report 503 and leave authoritative state unchanged. Aggregate stored amounts permit more digits than single input amounts.

## Friction, stopping points and alternatives

- Native filesystem/UI entry point signatures required reading implementation and checker metadata because the public catalog lists names more than detailed argument contracts. Work continued using `readTextSync`, `writeTextSync`, `rename`, `ui.form`, `ui.request` and explicit refresh controls.
- Native release compilation of the first incident GUI took about 80 seconds under parallel repository activity. This was a build delay, not a failed or abandoned application.
- None of this project's intended bounded workflow was abandoned. Production deployment, multiple writers, external integrations and other scope limits are documented in README rather than silently presented as complete.

## Verification

Status: PASS for native check, fresh release build and executable integration tests. Exact results are in the track `verification.json` and linked final evidence below. Do not interpret this status as a production qualification.

## Relocation correction

Another track observed that `web.serve` resolves its source directory even with static assets disabled. Added an explicit `root: process.cwd()` so a deployed binary uses its runtime working directory. The final integration pass rebuilds this correction.

## Intermediate test result retained

The first failed-write smoke assertion expected HTTP 503 but an already-built executable returned HTTP 400 with `Is a directory`. Source had been corrected while the initial build queue was active, so those `.build/app` executables predated the error-classification change. Rebuilding the corrected source resolved that response mismatch; `.build/smoke-initial.log` retains the intermediate failure. Final verification builds a separate `verified-app` and records its source and binary hashes.

## Final result

PASS: native check, fresh release build and executable integration smoke test all exited 0. Exact source/test/compiler/binary identities and command logs are in [verification evidence](../../reports/20261113T133140.200181Z/results.json). No project workflow remains blocked or abandoned. Browser interaction evidence, where applicable, is reported by the root integration report.

## Independent review: Unicode rollout correction

Independent review found that the original string `for` loop iterated Unicode code points, then `charCodeAt(0)` included only the first UTF-16 code unit of a supplementary character. This contradicted the documented code-unit algorithm. For key `new-dashboard` and subject `😀`, the original bucket was 1866 instead of 4678, incorrectly enabling a 30% rollout. Replaced it with an indexed loop over `input.length` and `input.charCodeAt(index)`. Added a regression asserting the exact bucket 4678 and disabled result at 30%. Earlier ASCII-only verification did not catch this; the follow-up evidence below supersedes the previous feature-flag row.

Follow-up result: PASS for fresh native check, release build and smoke test including the exact emoji regression. [Superseding feature-flag evidence](../../reports/20261113T133801.993236Z/results.json). The earlier binary hash is historical and does not identify the corrected executable.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.
