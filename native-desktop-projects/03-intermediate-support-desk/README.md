# Harbor Support Desk

A native macOS support application. The shared AppKit host provides the actual native window, table, search, detail panel, forms, view switcher, CSV export, and application menus. This project's compiled Arya worker owns tickets, validation, lifecycle, history and durable JSON storage. It does not start a web server or use a browser renderer.

## Workflow

1. Open the packaged Harbor Support Desk application and select **New ticket**.
2. Enter title, customer, owner, priority and description. The active table updates after saving.
3. Select a ticket to edit its complete details or change status.
4. Follow **Open → Investigating → Waiting/Resolved**. Waiting can return to Investigating or become Resolved; Resolved can reopen to Open.
5. Switch among Active tickets, All tickets and Ticket history. Search filters the current native table. Deleting a ticket requires confirmation and preserves its history.

Every edit, status change and delete checks the selected row's version. A stale row must be refreshed before it can overwrite newer work. Urgent unresolved tickets are counted in the summary.

## Build and integration checks

From this directory:

```sh
make check
make build
python3 smoke.py .build/worker
```

The shared collection builder packages the native host and this worker into the `.app`. The worker itself can also be inspected without a GUI:

```sh
DATA_FILE=/tmp/support-data.json .build/worker list '{"view":"active"}'
DATA_FILE=/tmp/support-data.json .build/worker add '{"view":"tickets","title":"Export fails","customer":"Nadia","owner":"Sam","priority":"Urgent","description":"Invoice export reports an error."}'
```

The resulting JSON includes `ok`, `message`, `rows`, and `summary`. Action commands are `add`, `edit`, `transition`, and `delete`. Edit/delete/transition require `id` and numeric `version`; `transition` takes `status` and optional `note`. The `ui.json` describes every native form and action.

Python is integration-test tooling only. The delivered app runs its compiled native Arya executable directly.

## Storage and limits

The packaged app stores data in the host's Application Support directory. `DATA_FILE` overrides the location for isolated testing. Every invocation loads and validates the persisted snapshot. Mutations stage a private random sibling file and rename it into place; rejected operations and failed writes preserve the previous file. No fsync-level power-loss guarantee is claimed. The host provides a single-instance store lock.

Limits: 300 tickets, the most recent 1000 history events, and 4 MiB total JSON. Oldest history is removed when its limit is reached. History records events and selected change details; it is not a complete reversible audit snapshot. This is a local single-operator application, without email delivery, authentication, attachments, team synchronization, or service-level timers. Corrupt storage is reported instead of reset.

See [REPORT.md](REPORT.md) for implementation and verification evidence.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
