# Six real native desktop applications — completion report

**Completed: 6 of 6 native macOS GUI applications**, one for each developer track. All six have packaged `.app` bundles, persistent workflows, native controls, documentation and tests. No application was abandoned.

Open the [application folder](dist), or follow the [README](README.md). The [acceptance record](reports/acceptance.json) identifies every delivered file by hash and links exact verification evidence. The [native interaction report](reports/native-gui-qa.md) records the actual GUI operations and the defect found during them.

## What changed from the earlier delivery

The earlier six GUIs used browser interfaces. This delivery builds six separate, broader desktop applications in `native-desktop-projects/`. Their windows, tables, menu bars, sheets, text fields, dropdowns, search controls and Save dialogs are real AppKit controls. There is no web page, embedded browser, HTTP server, WebKit, Electron, Node or Python application runtime.

Arya's existing desktop API hosts a WKWebView and therefore could not supply the requested native controls. The shared [NativeHost.m](shared/NativeHost.m) bridge supplies macOS controls, while all six domain engines are written in Arya and compiled to native executables. Each bundle includes both binaries. The host sends command/JSON arguments directly to the engine and reads a JSON response; it never invokes a shell for application actions. This is not a claim that a native widget API has been added to Arya itself.

The levels are simulated developer tracks, not six human participants or certification of production readiness.

## Applications

| Track | Native application | Implemented workflows | Work report |
| --- | --- | --- | --- |
| Beginner | Study Desk | Session creation/editing, due dates, completion/reopening/deletion, remaining time, note library | [Report](01-beginner-study-desk/REPORT.md) |
| Better | Stockroom | Product/SKU management, exact unit price/valuation, receive/issue, negative-stock rejection, low-stock status, immutable movement history | [Report](02-better-stockroom/REPORT.md) |
| Intermediate | Harbor Support Desk | Ticket CRUD, customers/owners/priorities, lifecycle, active/all views, historical events, stale-edit rejection | [Report](03-intermediate-support-desk/REPORT.md) |
| Advanced | Project Studio | Projects and tasks, dynamic project assignment, due dates/overdue work, assignees, WIP limits, progress, protected project deletion and history | [Report](04-advanced-project-studio/REPORT.md) |
| Pro | Incident Center | Service catalogue, incident CRUD, severity/ownership, investigation/resolution/reopening, notes and complete activity timeline | [Report](05-pro-incident-center/REPORT.md) |
| World class | Ledger Studio | Account management, exact double-entry journals, idempotent references, reversals, normal balances, statement reconciliation and history | [Report](06-world-class-ledger-studio/REPORT.md) |

All applications also provide native search, selection details, editable forms, CSV export, menus/keyboard shortcuts, Show data folder, About, persistent storage outside the bundle, and a host-level store lock. Validation errors preserve form values so users can correct them.

## Actual work log

1. Inspected current desktop runtime/compiler code and confirmed that `desktop.open` is a WebKit wrapper. Chose actual AppKit widgets to meet the corrected request.
2. Defined a [native host/engine protocol](shared/PROTOCOL.md), then assigned two application engines to each of three parallel workers. The workers owned six separate directories; the coordinating agent implemented the shared host and packaging.
3. Implemented six distinct domain engines, persistent schemas, input and loaded-state validation, bounded stores, stale-record checks, snapshots and user-readable failures. The engines start a fresh native process per command, so persistence is exercised continuously.
4. Implemented asynchronous native engine calls, native view switching, tables/details, editable sheets, dynamic dropdowns, validation recovery, destructive confirmations, CSV Save dialogs, application menus, single-store locking and a bounded process deadline.
5. Built each engine, ran its black-box lifecycle/error/persistence tests, and recorded per-project source/UI/test/compiler hashes. Python only coordinates builds and tests.
6. Built the AppKit host, packaged the six bundles, ad-hoc signed them, verified signatures and checked all configured views through each packaged host/engine boundary.
7. Independently reviewed the host and builder. Corrected duplicate-name dropdown mapping, candidate-publication order and form/refresh interaction. Recorded exact AppKit probe output in [shared/REVIEW.md](shared/REVIEW.md).
8. Used native computer controls to exercise every application's GUI. Found and fixed populated-table navigation, rebuilt the host/bundles, and reran affected navigation workflows.
9. Audited final source and delivered binary hashes, confirmed the host has no WebKit/JavaScriptCore linkage, and verified the CSV export contents. Closed test apps and archived exclusively generated test data so normal first launches start empty.
10. Wrote this report, individual work reports, README usage/build instructions and final acceptance records. Earlier source and browser projects were preserved; no compiler/runtime source changes were needed for this task.

## Problems, stuck points and resolutions

| Finding | What happened | Resolution / status |
| --- | --- | --- |
| Arya has no native AppKit widget API | Existing desktop support loads local HTTP content in WKWebView. | Added a shared Objective-C AppKit bridge in this collection. Arya owns application behavior. Native widgets are not falsely attributed to the existing Arya desktop module. |
| Populated table view-switching exception | Project Studio changed columns while AppKit retained an old row count, producing NSRangeException and an incomplete view. | Empty-table reload before reconstruction plus safe delegate bounds. Corrected native navigation passed with persisted data. |
| Duplicate dropdown labels | AppKit `addItemWithTitle:` collapsed duplicate titles, breaking index-to-record mapping. | Distinct NSMenuItems retain their true IDs in representedObject. A probe verified all three values when two labels matched. |
| Packaging replaced output too soon | An unverified candidate could replace the prior bundle before protocol/hash checks finished. | Validate inside staging; preserve the previous bundle until candidate publication succeeds. Reviewed by source; filesystem failures were not injected. |
| Form and refresh could overlap | A menu refresh could start while a sheet was open, causing a stale response or dropped confirmation. | An editing flag blocks conflicting work until the sheet is canceled or submitted. Source-reviewed correction; no interactive race stress test is claimed. |
| Initial worker used unsupported `typeof` syntax | Native checker rejected intermediate/advanced code. | Replaced with `runtime.kind`; final checks/builds pass. |
| Store byte boundaries | A persisted newline and Unicode byte length need to fit the documented file limit. | Stores validate encoded bytes, including the trailing newline where used. |
| Incident service description boundary | Valid long descriptions could overflow a shorter timeline field. | Aligned the description/timeline boundary and added coverage. |
| Reconciliation reference input | Commas/newlines in references would make the simple statement format ambiguous. | Reject these characters; document the bounded reference,amount format. |
| Optional service/dynamic record choices | A new incident may have no service; account/project assignment needs real record IDs. | Optional choices include Unassigned; required choices use current records and are independently validated in Arya. |
| Native runtime warnings | Existing macOS ucontext deprecation warnings appeared during engine compilation. | Compilation and tests passed; runtime replacement is separate work. |
| Native accessibility tooling | App launch timeout and sheet-transition accessibility errors occurred. | Re-read actual state, selected the running app and used keyboard selection when needed; results were verified after actions. |

No project was abandoned. All requested scoped native workflows are implemented. The native-widget gap was solved with the documented bridge; no web wrapper was substituted.

## Verification and its limits

The [full build run](reports/20261113T140114.042188Z/results.json) passed fresh checks, release builds, six integration suites, signatures and bundle protocol checks. The suites exercise creation/editing/deletion, workflow constraints, persistence across processes, invalid/corrupt data and failed-write preservation. Exact finance tests cover balances larger than JavaScript's safe integer range, balanced entries, duplicate/conflicting references, reversals and reconciliation.

Native interaction testing then found the table transition defect. The [final host/bundle run](reports/20261113T140548.407270Z/results.json) rebuilt the corrected host, repackaged the unchanged verified engines, re-signed all six apps and passed every bundle protocol check. It is labeled `package-only` because engine compilation/tests were not redundantly rerun. [acceptance.json](reports/acceptance.json) joins the successful engine evidence to the final bundle evidence and matches current input files and every delivered bundle file.

The independent review's recorded host hash predates the later table-transition fix. That later change and its native GUI verification are documented above; final identity is in acceptance.json.

Tested platform: macOS 26.5.2 ARM64. These are local, ad-hoc signed apps, not notarized public releases. Other platforms/OS versions were not qualified. They use bounded local JSON files, one host per store, and do not promise multi-user synchronization, power-loss durability, cloud deployment or enterprise production certification. Direct engine callers must also serialize writes. App-specific limits are explicit in each README.

Ledger Studio is a local double-entry/reconciliation tool with bounded workflows. It does not supply tax filing, bank connectivity or regulated financial operations. Native CSV exports are reports, not a complete database backup/import system; the actual JSON store can be backed up from the data folder.
