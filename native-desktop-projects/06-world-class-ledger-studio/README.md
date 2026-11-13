# Ledger Studio

A native macOS double-entry bookkeeping application. AppKit provides native account/journal tables, searchable views, detail panes and edit dialogs. A compiled Arya worker validates and persists accounts, exact journals, reversals and reconciliation reports. There is no web server or browser view.

## Build and open

From the repository root:

```sh
python3 native-desktop-projects/build.py --filter 06-world-class-ledger-studio
open "native-desktop-projects/dist/Ledger Studio.app"
```

See the [collection guide](../README.md) for SDK, native host and signing details. Python is build/test tooling only; the completed application runs native executables.

## A complete workflow

1. In **Accounts**, create `1000 / Cash / Asset` and `4000 / Sales / Income`. Account codes are unique; dropdowns display code and name.
2. In **Journals**, choose **Post journal**. Enter reference `SALE-001`, a valid date in `YYYY-MM-DD` format, debit Cash, credit Sales, amount `125.50`, and a meaningful description.
3. Inspect both account balances. The normal balance is debit minus credit for asset/expense accounts and credit minus debit for liability/income/equity accounts. Each journal has exactly equal debit and credit amounts.
4. Repeating the same reference and semantic posting returns the original without adding a duplicate. Changing its amount, accounts, date or description causes a conflict. Amounts `1` and `1.00` are equivalent.
5. To correct a posted journal, select it and use **Reverse journal** with a new reference, date and reason. The original remains, its reversal swaps debit and credit, and both entries link to each other. A journal can be reversed only once; a reversal cannot itself be reversed. Post a new correcting journal afterward.
6. Select an account and choose **Reconcile selected account**. Paste one `reference,signed-amount` per line, without a header. Debit movements are positive and credit movements negative. For the Cash example after reversal, paste:

```text
SALE-001,125.50
REV-SALE-001,-125.50
```

Use the actual reversal reference. The report compares every selected-account journal movement against the statement by reference, finding missing references and amount differences independently of the net total. Review **Reconciliation history** and its detail pane; deleting a report never changes journals.

Account names/descriptions/codes can be edited. Types become fixed once used. Unused accounts can be deleted. Used zero-balance accounts can be closed and reopened; posting to a closed account is rejected. Negative balances are allowed because this is general bookkeeping, not an overdraft authorization system.

## Persistence and exactness

Data is stored under `~/Library/Application Support/Arya Native/ledger-studio/data.json`. The native host locks a single application instance per store; `DATA_FILE` provides an isolated worker store for testing. Mutations write a temporary file and atomically rename it before reporting success. Stale selected versions, corrupt stored account/journal/reversal links and failed writes produce errors without resetting the existing data.

All monetary boundaries use decimal strings and exact `std decimal` arithmetic. One ledger has one currency and two decimal places. Individual amounts allow up to 18 integer digits; totals can grow beyond that without binary-floating-point loss. References cannot contain commas or line breaks, preserving the simple statement format. Statement duplicate references are rejected.

Limits: 500 accounts, 5,000 journals, 100 retained reconciliation reports, 5,000 statement rows, 200,000 statement characters and a 4 MiB store. The operating system also bounds the size of a command argument. This app manages a local ledger; it does not provide bank feeds, tax filing, user permissions, multi-machine synchronization or multi-currency accounting. Filesystem replacement does not promise fsync-level power-loss durability. Native CSV export and the data-folder command support review and backup workflows.

## Worker commands and verification

All bodies include a view (`accounts`, `journals`, or `reconciliations`). Selection actions include `id` and `version`; `ui.json` defines the nine native actions and dynamic account choices. Every successful action returns current rows for its requested view.

```sh
mkdir -p native-desktop-projects/06-world-class-ledger-studio/.build
./bin/arya check native-desktop-projects/06-world-class-ledger-studio/main.arya
./bin/arya build native-desktop-projects/06-world-class-ledger-studio/main.arya -o native-desktop-projects/06-world-class-ledger-studio/.build/worker --release --force
python3 native-desktop-projects/06-world-class-ledger-studio/smoke.py native-desktop-projects/06-world-class-ledger-studio/.build/worker
```

Tests launch a fresh native process for every operation. They cover account CRUD/status, stale versions, exact 19-digit totals, balanced postings, semantic replay/conflicts, reversal links, reconciliation findings, corrupt stores and failed-save rollback. [Verification](verification.json) records exact source/test/worker hashes; [REPORT.md](REPORT.md) records implementation decisions and problems. Native AppKit interaction and final bundle checks are recorded in the collection report.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
