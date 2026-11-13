# Everyday Calculator: developer report

Date: 2026-11-13. Track: 02-better-everyday. The developer label is a simulated skill brief, not a claim about a human participant.

## Work performed

1. Read `../shared/PROTOCOL.md` and inspected the native calculator build contract. Created a new calculator project, preserving the prior application collections and language/runtime sources.
2. Implemented a standalone Arya engine with a bounded numeric tokenizer, explicit arithmetic parsing, finite checks, persisted result/history and one-line JSON responses. No `eval`, shell execution, foreign arithmetic runtime or web modules are used.
3. Added `ui.json` for the AppKit host, including calculator insertion keys and the history view. Removed a redundant clear-history action after root confirmed that the host supplies a built-in native confirmation and control.
4. Added independent numerical-oracle and persistence tests. Explicit precedence/function/percent examples and randomized expression trees are compared with independent Python arithmetic and `math` results. The test generator never uses `eval` or the production parser. Memory arithmetic, recall, overflow and failed memory writes are also exercised.
5. Ran `arya check`, built `.build/worker --release --force`, then ran `python3 smoke.py .build/worker`. All passed; **103 worker calls** completed successfully. Native macOS compilation emitted the existing runtime `ucontext` deprecation warnings; they did not prevent building or testing.
6. Documented run/build instructions, native boundaries, grammar, binary64 precision, limits, persistence and rejection behavior. Root owns final `.app` packaging and interactive GUI validation.

## Observed problems and decisions

No implementation failure occurred during the first check/build/acceptance sequence for this calculator. This report does not invent beginner mistakes or abandoned attempts. The root host's existing clear-history feature made a duplicate UI action unnecessary; only the duplicate configuration entry was removed, retaining the required engine command.

The arithmetic boundary is explicit: binary64 can round decimal values and underflow very small results. Finite arithmetic and supported grammar are checked; exact decimal financial semantics are not claimed. 1024 characters, 256 lexical tokens and at most 32 nested unary/parenthesis/function levels.

## Evidence and completion

- Source check: passed.
- Native release build: passed.
- Black-box worker acceptance: **107 calls passed** after the persistence correction, including independent arithmetic expectations and rejected-input byte preservation.
- `verification.json` records source, UI, test and development worker hashes.
- Packaged native GUI checks: root integration evidence, separate from worker acceptance.

No calculator was abandoned. The specified calculator engine and native interface configuration are complete. History is capped at 100 entries and storage at 256 KiB. Other operating systems, multi-writer direct worker use and power-loss recovery are outside this delivery.

## Persistence review correction

After the initial passing run, independent review found that the fixed `data.json.tmp` path could follow an existing symlink. Reproduced with an isolated store: make `.tmp` a symlink to `data.json`, calculate again, and the old worker returned success while replacing the store with a self-referential symlink. The original tests had blocked `.tmp` with a directory and did not cover symlinks.

Replaced that fixed path with a private sibling `fs.tempDirectory(file + ".stage-XXXXXX")`, wrote `data.json` inside it, atomically renamed the staged file, and cleaned up. Cleanup is best-effort after publication, so a cleanup problem does not misreport a committed change as a failed save. Startup now checks `fs.infoSync` directly: absent files initialize state; existing or dangling symlinks and other non-files are refused. This closes the previous `existsSync` gap for dangling links.

Added regressions for a stale `.tmp` symlink pointing at an external sentinel and at the store, rejection/preservation of existing and dangling `DATA_FILE` links, absence of staging leftovers, and failed saves with a readable store in an unwritable parent. Everyday additionally exercises failure of a memory write. The permission checks explicitly require the ordinary desktop user. Final check/build/test results and refreshed hashes are recorded in `verification.json`; root rebuilds the final `.app` packages from these corrected sources.
