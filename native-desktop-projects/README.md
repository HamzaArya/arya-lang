# Six native Arya desktop applications

Six developer tracks now have real macOS desktop applications. The interface uses AppKit windows, tables, menus, text controls, dropdowns and native file dialogs. Domain logic, validation, exact arithmetic and persistence compile from Arya. These applications retain their shared Objective-C AppKit bridge, built before Arya gained the direct `std gui` widget library.

The delivered apps use no web pages, HTTP server, WebKit, Electron, Node or Python runtime. Each `.app` contains two native executables: its AppKit interface and its compiled Arya engine. Python is used only for building and testing.

## Open the applications

All six final applications passed fresh engine tests, bundle checks and local native host/worker protocol checks. The earlier native GUI workflows remain documented; final Study Desk launch and About version were inspected again. See [final application qualification](../docs/verification/2.0.0/application-release.md).

Extract `.build/release-2.0.0/final/arya-native-desktop-apps-2.0.0-darwin-arm64.zip` and double-click an app, or copy it to Applications. The full SDK is not needed to run it. The original [dist folder](dist) is preserved as historical output.

| Developer track | Application | Complete local workflows |
| --- | --- | --- |
| Beginner | [Study Desk](01-beginner-study-desk/README.md) | Plan/edit/complete/reopen study sessions, due dates, notes library |
| Better | [Stockroom](02-better-stockroom/README.md) | Products, SKU checks, receive/issue stock, movement history, low-stock status, exact valuation |
| Intermediate | [Harbor Support Desk](03-intermediate-support-desk/README.md) | Tickets, ownership, priority, workflow, editing, active/all views, history |
| Advanced | [Project Studio](04-advanced-project-studio/README.md) | Projects, task assignment, due dates, overdue work, WIP limits, progress and activity history |
| Pro | [Incident Center](05-pro-incident-center/README.md) | Service catalogue, incidents, severity/ownership, investigation/resolution/reopening, timeline |
| World class | [Ledger Studio](06-world-class-ledger-studio/README.md) | Accounts, exact double-entry postings, idempotent references, reversals, reconciliation history |

All apps include native search, record details, editing dialogs, CSV export with a Save dialog, keyboard editing shortcuts, Refresh, About, and Show data folder. Choose a view, create records with its buttons, then select a row to edit or perform a workflow action. Failed form submissions preserve entered values for correction. Account/project/service choices display names and carry the correct internal record ID.

For example, after extracting the final archive into the current folder:

```sh
open "arya-native-desktop-apps-2.0.0-darwin-arm64/Study Desk.app"
open "arya-native-desktop-apps-2.0.0-darwin-arm64/Ledger Studio.app"
```

The final archive SHA-256 is `71d74735771bac3c727736e2fb943a83446b0afc6cba0122ea4b1d80233ab6a7` (6,948,635 bytes). The earlier [original ZIP](Arya-Native-Desktop-macOS-arm64.zip) and its [checksum](Arya-Native-Desktop-macOS-arm64.zip.sha256) remain historical artifacts.

## Data and portability

Data is stored outside the bundles, under `~/Library/Application Support/Arya Native/<app-id>/data.json`. The File menu opens that directory. Existing stores are validated on load; corrupt files are reported rather than silently reset. Updates use temporary-file replacement. Back up this folder if the data matters. A native lock prevents two host instances using the same store at once.

CSV export includes the currently visible filtered rows. Formula-like cells receive a leading apostrophe so opening an export in a spreadsheet does not interpret those values as formulas. This export is a report, not a full-store backup/import format. Each README describes its limits.

The final bundles were built on ARM64 macOS CI and verified again on macOS 26.5.2. Their application minimum is macOS 26.0, distinct from the SDK compiler's macOS 15 minimum. They are ad-hoc signed, with no Developer ID signature or Apple notarization. macOS may block downloaded apps on first launch; compare the official archive checksum and read the [installation and signing notes](../docs/installing.md#downloaded-macos-applications). Other CPU architectures and Windows/Linux versions of these AppKit applications are not supplied; Arya's direct `std gui` backends do not automatically port these bundles.

## Build and verify

From this repository's root, with the native SDK and Apple command-line tools installed:

```sh
python3 native-desktop-projects/build.py
python3 native-desktop-projects/build.py --filter 04-advanced
```

The builder checks and compiles each Arya engine, runs its integration tests, packages the native host and engine, signs and verifies the bundle, and checks every view through the packaged host/engine boundary. A candidate replaces an existing bundle only after validation succeeds. Logs and hashes go to timestamped folders under `reports/`.

`--package-only` reuses existing compiled engines during native UI development; it does not claim new engine checks. `--compiler /absolute/path/to/arya` selects another compiler. Build/test controllers require Python 3; compiled applications do not.

For a release rebuild, use `--output /absolute/path/to/a/new/bundle-directory`
and `--app-version 2.0.0` to preserve the historical `dist/` bundles. The builder
records the selected compiler command and its hash, and keeps each smoke-tested worker byte-for-byte intact
when signing its enclosing app. `package-release.py --help` describes archiving
the complete successful build report; it verifies extracted signatures and
refuses to replace an existing archive or evidence file.
Release verification passes the native executable directly; selecting a launcher
instead records that launcher's identity.

[REPORT.md](REPORT.md) records actual work, failures, fixes, final evidence and remaining limits. Every application has its own work report and integration tests. The six levels are simulated development tracks; they do not certify production readiness or represent human study participants.
