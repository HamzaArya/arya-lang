# Incident Center

A native macOS operations application. AppKit supplies the sidebar, searchable tables, detail pane and edit dialogs; a compiled Arya worker owns every business rule and the persistent store. There is no web server or browser view.

## Build and open

From the repository root:

```sh
python3 native-desktop-projects/build.py --filter 05-pro-incident-center
open "native-desktop-projects/dist/Incident Center.app"
```

See the [collection guide](../README.md) for SDK, native host and signing details. Python is build/test tooling only; the completed `.app` launches native executables directly.

## Everyday workflow

1. Open **Services**, choose **New service**, and add a service name, owner, health and optional description.
2. Open **Incidents** and choose **New incident**. Enter a title and owner, select P1/P2/P3 and optionally link a service from the catalogue.
3. Select an incident to see its complete activity history in the detail pane. Edit ownership/details, add investigation notes, and use **Advance status** to move open → investigating → resolved.
4. Use **Reopen incident** with a reason when a resolved problem recurs. Deletion is available only after resolution and preserves its timeline entries.
5. Use **Activity timeline** to review changes across incidents and services. Search, refresh and native CSV export are available in the shared application controls.

Service health is maintained by the operator. The service view counts active linked incidents. Referenced services cannot be deleted until their incidents are reassigned or removed. Duplicate service names are rejected case-insensitively.

## Persistence and errors

The host stores data under `~/Library/Application Support/Arya Native/incident-center/data.json` and locks a single application instance per store. `DATA_FILE` overrides the store for isolated worker testing. Every mutation validates the selected id/version, writes a temporary file, then atomically renames it before reporting success. Failed writes leave the original store and selected record versions unchanged. Corrupt or incompatible stores are rejected rather than reset. The UI reports actionable errors and lets the operator correct input.

Limits: 1,000 incidents, 500 services, 10,000 timeline entries and a 4 MiB store. Titles are 160 characters; owners/service names 100; descriptions/notes 2,000. History is immutable and remains after deletion. This is a local operations record with manual ownership and health; it does not send pages, poll remote systems or synchronize multiple machines. Filesystem replacement does not promise fsync-level power-loss durability. Use the native CSV export and retain store backups as appropriate.

## Arya worker protocol and tests

The native host calls the worker with a command and one JSON object argument. Every body includes `view` (`incidents`, `services`, or `timeline`); all successful commands return the updated rows for that view. Selection actions include `id` and `version`.

```sh
mkdir -p native-desktop-projects/05-pro-incident-center/.build
./bin/arya check native-desktop-projects/05-pro-incident-center/main.arya
./bin/arya build native-desktop-projects/05-pro-incident-center/main.arya -o native-desktop-projects/05-pro-incident-center/.build/worker --release --force
python3 native-desktop-projects/05-pro-incident-center/smoke.py native-desktop-projects/05-pro-incident-center/.build/worker
```

`ui.json` lists all nine actions and their fields. `smoke.py` launches a separate worker process for every command and checks the full lifecycle, services, version conflicts, input boundaries, corrupt state and failed-save rollback. [Verification](verification.json) records the source/test/worker hashes; [REPORT.md](REPORT.md) records the work and limitations. Native AppKit interaction and final bundle checks are recorded in the collection report.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
