# Arya six-developer project report

**Completed: 18 of 18 projects**, comprising six CLIs, six browser GUIs, and six HTTP services. Every delivered source has a matching successful native check, release build, and black-box workflow test. All six GUIs were also exercised through the installed browser. No project was abandoned.

Date: 2026-11-13. Platform tested: macOS 26.5.2 ARM64. Compiler: Arya native 2.0.0-alpha.3, SHA-256 `a028cce0e2888b846ac288aaabc7eac4d17e53329735a671aee4d2682e886771`.

This opening record identifies the original 18-project delivery. Later API and
storage migrations are recorded at the end. The subsequent native-software
requests produced separate [desktop applications](../native-desktop-projects/REPORT.md)
and [calculators](../native-calculators/REPORT.md); their final 2.0.0 bundles have
their own compiler and archive identities.

The six skill levels are simulated developer tracks, not a claim that six human participants were observed. The labels describe increasing application complexity; “world class” does not mean production certification. The projects implement complete bounded workflows described in their READMEs.

Start with the [project catalog and run instructions](README.md). The [final acceptance record](reports/acceptance.json) links exact per-project check/build/test logs and executable/source hashes. [Browser evidence](reports/browser-qa.md) records the actual actions and the limits of GUI verification.

## Delivered projects and results

| Track / project | Kind | Final result | Work report | Verification |
| --- | --- | --- | --- | --- |
| Beginner / [Expense notebook](01-beginner/cli-expenses/README.md) | CLI | Pass | [Work log](01-beginner/cli-expenses/REPORT.md) | [Evidence](reports/20261113T132826.232092Z/results.json) |
| Beginner / [Study planner](01-beginner/gui-study-planner/README.md) | GUI | Pass | [Work log](01-beginner/gui-study-planner/REPORT.md) | [Evidence](reports/20261113T133145.356576Z/results.json) |
| Beginner / [Notes API](01-beginner/service-notes/README.md) | Service | Pass | [Work log](01-beginner/service-notes/REPORT.md) | [Evidence](reports/20261113T132826.232092Z/results.json) |
| Better / [Inventory manager](02-better/cli-inventory/README.md) | CLI | Pass | [Work log](02-better/cli-inventory/REPORT.md) | [Evidence](reports/20261113T132827.374167Z/results.json) |
| Better / [Habit tracker](02-better/gui-habit-tracker/README.md) | GUI | Pass | [Work log](02-better/gui-habit-tracker/REPORT.md) | [Evidence](reports/20261113T133146.556905Z/results.json) |
| Better / [Bookmark API](02-better/service-bookmarks/README.md) | Service | Pass | [Work log](02-better/service-bookmarks/REPORT.md) | [Evidence](reports/20261113T132827.374167Z/results.json) |
| Intermediate / [Log analyzer](03-intermediate/cli-log-analyzer/README.md) | CLI | Pass | [Work log](03-intermediate/cli-log-analyzer/REPORT.md) | [Evidence](reports/20261113T132927.563792Z/results.json) |
| Intermediate / [Support desk](03-intermediate/gui-support-desk/README.md) | GUI | Pass | [Work log](03-intermediate/gui-support-desk/REPORT.md) | [Evidence](reports/20261113T133254.839934Z/results.json) |
| Intermediate / [Reservation API](03-intermediate/service-reservations/README.md) | Service | Pass | [Work log](03-intermediate/service-reservations/REPORT.md) | [Evidence](reports/20261113T133423.493719Z/results.json) |
| Advanced / [Backup manifest](04-advanced/cli-backup-manifest/README.md) | CLI | Pass | [Work log](04-advanced/cli-backup-manifest/REPORT.md) | [Evidence](reports/20261113T133508.368270Z/results.json) |
| Advanced / [Project board](04-advanced/gui-project-board/README.md) | GUI | Pass | [Work log](04-advanced/gui-project-board/REPORT.md) | [Evidence](reports/20261113T134135.634563Z/results.json) |
| Advanced / [Job queue API](04-advanced/service-job-queue/README.md) | Service | Pass | [Work log](04-advanced/service-job-queue/REPORT.md) | [Evidence](reports/20261113T133508.368270Z/results.json) |
| Pro / [Ledger audit](05-pro/cli-ledger-audit/README.md) | CLI | Pass | [Work log](05-pro/cli-ledger-audit/REPORT.md) | [Evidence](reports/20261113T133140.200181Z/results.json) |
| Pro / [Incident console](05-pro/gui-incident-console/README.md) | GUI | Pass | [Work log](05-pro/gui-incident-console/REPORT.md) | [Evidence](reports/20261113T133140.200181Z/results.json) |
| Pro / [Feature flag API](05-pro/service-feature-flags/README.md) | Service | Pass | [Work log](05-pro/service-feature-flags/REPORT.md) | [Evidence](reports/20261113T133801.993236Z/results.json) |
| World class / [Release evidence gate](06-world-class/cli-release-gate/README.md) | CLI | Pass | [Work log](06-world-class/cli-release-gate/REPORT.md) | [Evidence](reports/20261113T133315.776053Z/results.json) |
| World class / [Reconciliation workbench](06-world-class/gui-reconciliation/README.md) | GUI | Pass | [Work log](06-world-class/gui-reconciliation/REPORT.md) | [Evidence](reports/20261113T133315.776053Z/results.json) |
| World class / [Idempotent ledger API](06-world-class/service-idempotent-ledger/README.md) | Service | Pass | [Work log](06-world-class/service-idempotent-ledger/REPORT.md) | [Evidence](reports/20261113T133315.776053Z/results.json) |

Each project contains `main.arya`, `arya.json`, `README.md`, `REPORT.md`, and a `smoke.py` integration controller. Final native executables are available locally at each project's `.build/verified-app`; build outputs are ignored by Git. Each developer folder also has a track report. CLI projects that consume structured input provide samples or create fixtures in their integration tests.

## Work performed

1. Inspected the native language guides, standard-library source, project templates, available compiler and working tree. Recorded the [starting environment](reports/environment.json).
2. Found 281 pre-existing changed/untracked paths outside this collection. All work for this request stayed under `developer-projects/`.
3. Selected one distinct CLI, GUI and service for each track, and assigned implementation to three parallel workers owning two track directories each. No worker modified the compiler or runtime.
4. Built real domain operations: exact expense totals and inventory changes; log aggregation and integrity manifests; journal audits and supplied-evidence release gates; persisted planning/tracking/triage/incident/reconciliation GUIs; notes/bookmarks/reservations/leased jobs/feature flags/idempotent monetary postings.
5. Added validation, bounded data, local persistence where required, failed-write handling, loopback binding and shutdown handling. Test cases exercise real executables and HTTP requests, including rejection and restart paths.
6. Added a shared launcher, machine-readable catalog and reproducible verification runner. The runner preserves per-command logs, source hashes, compiler identity and binary identity. It now rejects input changes during verification.
7. Checked and built all applications, ran their workflows, fixed discovered defects, and reran the affected checks. Earlier failed/stale runs remain in `reports/` and project work logs.
8. Exercised all six GUIs in Microsoft Edge using temporary data. Checked creation and updates, exact reconciliation differences, live status output, and persisted board contents. Temporary QA servers were stopped afterward.
9. Performed an independent read-only review of all 18 READMEs, source/test pairs and required-file inventories. This caught the Unicode feature-flag defect below. Fixed it and reran that service's full verification.
10. Audited final evidence against the current source/test hashes and actual `verified-app` hashes. All 18 matched; Markdown links were checked. The final acceptance record selects these matching results rather than every historical “pass.”

## Problems encountered, fixes and remaining friction

| Problem and impact | Resolution / remaining status |
| --- | --- |
| Expense `decimal.quantize` call with no explicit rounding mode passed checking but failed at runtime. | App supplies `half-even`; exact amount tests pass. Language-level audit confirmed that unannotated programs intentionally remain dynamic; annotated calls already reject missing arguments. The misleading runtime error is now fixed: missing rounding reports `ARYA_DECIMAL_ROUNDING`, with typed/dynamic regressions. See [API repairs](../docs/native-api-repairs.md). |
| Optional CLI arguments and `JSON.stringify` return types failed native checking. | Explicit argument/string fallbacks were added. Checked source passes. |
| Some larger server-option records were rejected by the checker although their hardcoded options were runtime-valid; a small probe did not reproduce the same rejection. | Reproduced by activating typed checking in the small probe. Native web option contracts now use readonly input records. The four intermediate/advanced `serverOptions: any` workarounds were removed; complete application check/build/smoke tests pass with inferred options. Wrong field types remain checker errors. See [API repairs](../docs/native-api-repairs.md). |
| Support priority select was initially given strings instead of `{value, label}` records. | Corrected to the actual UI API; final HTML/API tests and browser creation pass. |
| Some builds finished while source edits were being made, leaving stale binaries or stale evidence. | Rebuilt affected applications after edits stopped and audited hashes. Original attempts are preserved; only final matching evidence is accepted. |
| Initial GUI/service readiness deadlines were too short during concurrent compilation. | Some test controllers now allow more startup time. Flowboard's final smoke timed out once, then the identical binary/test passed on rerun. That resumed result reuses its successful check/build evidence and retains the original failed run; the original command is not called a pass. |
| TextVault lexical output containment missed macOS `/var` → `/private/var` aliases. | Canonicalized the manifest parent before containment comparison; a regression verifies rejection. |
| TextVault publication keeps the hard-linked staging file; a predictable staging name could also interact with an existing `.tmp` file. | Uses a private temporary directory with cleanup; tests preserve a sentinel and check cleanup. |
| Parseable but structurally invalid persisted data could break the advanced GUIs after startup. | Added per-row checks, bounded saved output and visible startup failure. Failed writes preserve authoritative in-memory state. |
| Character-count storage limits could exceed byte-based load limits for Unicode. | Beginner/better stores enforce UTF-8 byte limits. |
| Reconciliation totals sometimes serialized whole numbers without `.00`, then failed strict validation after restart. | Quantizes saved totals to two places. Restart and totals beyond 18 integer digits pass. |
| Feature-flag hashing skipped the low surrogate of emoji despite documenting UTF-16 code-unit iteration. | Uses indexed code-unit iteration. Regression verifies `new-dashboard` plus `😀` gives bucket 4678 and is disabled at 30% rollout; previous result 1866 was wrong. |
| The default web root depended on the original source directory, even with static assets disabled. | The original apps used an explicit working-directory root. Arya 2.0.0 now resolves static roots only when HTML/assets are enabled; actual moved-binary/source-removal HTTP tests passed on macOS and Linux. See [release repair evidence](../docs/native-release-2.0.0.md). |
| Native compilation emitted macOS `ucontext` deprecation warnings. | Builds succeeded. No runtime/compiler rewrite was attempted in this task. |
| Browser tab automation host unavailable; native browser control had ambiguous app IDs and intermittent focus/accessibility failures. | Used the full installed Edge app path, refreshed state, and direct field setting. Actual GUI outcomes are documented separately; no GUI was abandoned. |

The reports distinguish observed failures from source-review findings and test-harness problems. Files under `reports/` retain command outputs, including failures; a later success does not erase an earlier problem.

## Where scope stopped

**Abandoned applications: 0. Unfinished required application workflows: 0.** The following capabilities were outside the implemented briefs or unavailable through the chosen public APIs:

- TextVault now verifies binary and text integrity manifests using the 2.0.0 byte-file and byte-hash APIs. Its earlier text-only language blocker is resolved. It does not copy or restore files; size and concurrency limits remain explicit.
- These six GUIs remain browser applications built with Arya UI and native HTTP servers. Later native AppKit applications and calculators are in the separate collections linked above; the language now also supplies direct `std gui` controls.
- Several boards deliberately use explicit Refresh links for their card/table lists. Form feedback updates immediately; there is no invented claim of reactive list rendering or drag-and-drop.
- The job service exposes durable claim/finish/retry operations with leases. It does not execute arbitrary commands or supply a hosted worker fleet.
- The release gate evaluates supplied local evidence and does not deploy or attest remote systems. The ledger service implements scoped exact postings and idempotency; it is not a banking system or full double-entry accounting product.
- Stateful apps use bounded local JSON snapshots and one process per data file. They do not promise cross-process locking, power-loss durability, public hosting authentication/TLS, or production-scale storage. Exact per-app limits are documented.
- This original application delivery did not qualify Linux/Windows or mobile/cross-browser behavior. Its reported native checker defects were subsequently fixed in the language and the affected workarounds removed, as recorded below. Language platform qualification is separate from qualification of these 18 application workflows.

## Reproduction

From the repository root:

```sh
./developer-projects/run.sh 01-beginner/cli-expenses help
PORT=4311 ./developer-projects/run.sh 01-beginner/gui-study-planner
python3 developer-projects/verify.py
```

The launcher changes to the selected project directory. `DATA_FILE=/absolute/path/state.json` selects isolated storage for stateful apps; its parent must exist. `ARYA=/absolute/path/to/arya` selects another SDK for the launcher. The verifier accepts `--compiler` and `--filter`.

Python is verification tooling only. Application business logic and servers compile from Arya to native executables. GUI browser scripts come from Arya's UI library. The complete suite writes new timestamped evidence and exits nonzero on a failed project.

## Native API repair and storage migration — 2026-11-13

The language-level [API repair report](../docs/native-api-repairs.md) resolves the decimal diagnostic and structural web-option findings above, and documents new binary and atomic filesystem APIs. All 14 stateful applications in this suite now save through `fs.writeTextAtomicSync` and reject real/dangling store symlinks and nonregular entries before loading. The four intermediate/advanced options workarounds were removed.

[Migration verification](reports/language-api-storage-20261113.json) records fresh check/release-build/smoke passes, injected `.tmp` symlink sentinel preservation, 42 store-entry rejection cases, and matching source/test/native-executable hashes. Reproduce with `python3 native/tests/application-storage.py --build --filter developer-projects`. Parent-directory permission failures replace obsolete `.tmp`-blocker tests. These identities supersede the earlier acceptance record for these 14 changed sources/binaries; historical results remain preserved. Stateless CLIs were outside this migration, and TextVault's binary-file upgrade has separate ownership/evidence.
