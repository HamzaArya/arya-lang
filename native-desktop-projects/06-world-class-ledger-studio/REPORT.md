# Ledger Studio — native desktop work report

## Brief and implemented scope

World-class developer track: build a native desktop ledger with accounts, exact double-entry posting, semantic idempotency, immutable posted journals with reversals, and statement reconciliation. Three AppKit views and nine actions are defined in `ui.json`; every business rule and snapshot runs in native Arya. The skill label identifies a simulated brief, not a production certification or human study.

## Work performed

1. Read the shared native host protocol and designed commands that return updated rows for the caller's current view.
2. Implemented account creation/editing/closing/reopening/deletion with unique codes, stale-version checks, immutable types after use and dependency protection.
3. Implemented exact positive-amount journal pairs with debit and credit account validation. Every entry balances by construction. References provide semantic idempotency; normalized `1` and `1.00` replay without rewriting state.
4. Implemented reversals that retain originals, swap posting sides, link both records and reject repeated/double reversals. Identical reversal retries are also idempotent.
5. Implemented signed account-movement reconciliation, duplicate-reference validation, missing/mismatched-reference findings, exact aggregate totals and a retained report history. Indexed reference lookups and one-pass account totals avoid repeated whole-ledger scans for ordinary snapshots.
6. Implemented startup schema/id/account/reversal-link validation, bounded storage, save-before-success and failed-write rollback. Store totals permit more digits than individual inputs; totals are explicitly quantized before persistence.
7. Tested the whole workflow across separate native worker processes, including balances of `1999999999999999999.98`, normal account signs, stale versions, closed-account posting, idempotent conflicts, corrupt stores and unwritable temporary files.
8. Review found that arbitrary commas/newlines in a posting reference would make that reference impossible to represent in the intentionally simple statement format. Added explicit reference validation and a rejection test.

## Friction, limits and abandonment

The public browser-oriented UI modules do not provide this requested AppKit experience. Root integration supplies a native controls host; this worker imports no HTTP, HTML or browser UI modules. Native account choices use a computed `code · name` label to avoid ambiguous duplicate names.

Native compilation emitted the repository runtime's existing macOS `ucontext` deprecation warnings and succeeded. The worker contract passes input as a JSON command argument, so very large pasted inputs also face the operating system's argument-size limit; app-level statement/store bounds are documented. No compiler/runtime files were changed, and no intended bounded workflow was abandoned.

A single-currency local ledger, immutable journal reversal policy, account balance conventions, row/store limits and excluded external integrations are explicit in README. Those limits are not hidden unfinished features.

## Verification boundary

The initial 42-command workflow test passed. The final regression pass and exact input/worker hashes appear in `verification.json`. Each operation starts a fresh native process, exercising persistence continuously. Actual AppKit window/dialog interaction and final `.app` packaging are separate root integration checks recorded in the collection report.

## Language API storage repair — 2026-11-13

Migrated persistence to native `fs.writeTextAtomicSync`; loaders now inspect `fs.infoSync` directly and reject existing/dangling symlinks and nonregular stores. Fixed-name `.tmp` staging was removed. Write-failure smoke cases now deny creation in the parent directory, since an unused `.tmp` blocker no longer represents a write failure. Original source/tests were retained in `.build/language-api-repairs/migration-before/`. Verification passed: native check and release build; the full existing smoke suite with an injected `data.json.tmp` symlink sentinel; and separate-process rejection of an existing store symlink, dangling symlink, and directory store. Source, test, and executable hashes were checked after the run. See the suite-level `reports/language-api-storage-20261113.json`.
