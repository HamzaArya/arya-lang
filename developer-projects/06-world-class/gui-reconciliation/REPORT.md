# Statement reconciliation — work report

## Developer brief

Simulated 06-world-class track. Build a usable gui application in native Arya. Match statement references against book references with exact decimal amounts. Report mismatches, entries missing from either side, matched count and net difference. Persist the last 100 reconciliation summaries.

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

## Reproduced issue and fix

The final restart test failed with `Invalid stored decimal total.` after a comparison whose total was a whole amount. `decimal.add` may normalize away fractional zeroes; the stricter stored-data validator required two fractional digits. Quantized both aggregate totals to two digits before persistence, then reran full check/build/smoke verification. The reproduction is the mismatch run in `smoke.py` followed by restarting with the same store. An initial readiness check also timed out once during concurrent compilation; an isolated probe became ready within 0.5 seconds. Readiness polling now allows 15 seconds and retains server logs on failure. No application was abandoned.

## Intermediate test result retained

The first failed-write smoke assertion expected HTTP 503 but an already-built executable returned HTTP 400 with `Is a directory`. Source had been corrected while the initial build queue was active, so those `.build/app` executables predated the error-classification change. Rebuilding the corrected source resolved that response mismatch; `.build/smoke-initial.log` retains the intermediate failure. Final verification builds a separate `verified-app` and records its source and binary hashes.

## Final result

PASS: native check, fresh release build and executable integration smoke test all exited 0. Exact source/test/compiler/binary identities and command logs are in [verification evidence](../../reports/20261113T133315.776053Z/results.json). No project workflow remains blocked or abandoned. Browser interaction evidence, where applicable, is reported by the root integration report.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.

## Superseding 2.0.0 relocation repair

The source-folder dependency above describes the earlier SDK. In Arya 2.0.0, `web.serve` skips static-root resolution when both `html` and `assets` are `false`, as in this application; its explicit `root: process.cwd()` remains supported. The moved-executable/source-removal HTTP regression passed on macOS; see [release repair evidence](../../../docs/native-release-2.0.0.md). This documentation update records the language repair. The application's original test identities and platform coverage remain the evidence for its workflows.
