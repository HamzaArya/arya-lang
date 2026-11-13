# Study Desk

A native macOS desktop application with AppKit controls and native Arya application logic. Its views are **Study sessions and Notes**. The shared host renders a normal desktop window, tables, native dialogs and menus; `main.arya` is the standalone native worker. No HTTP server, HTML, browser engine, Node or Python runs the application.

## Features

- Create and edit subjects, duration estimates, optional due dates and session notes.
- Complete or reopen selected sessions; remove records with a native confirmation.
- View remaining minutes, planned/completed counts and overdue sessions.
- Keep a separate notes library with create, read, edit and delete operations.
- Search the current native table, inspect selected details and export the current view to CSV through the shared host.

## Use the native application

Open the `Study Desk.app` bundle produced by the collection's root packaging command. See the collection README for bundle locations and the shared host build. The bundle contains the host, matching compiled worker and `ui.json`.

Select **Study sessions**, then **New session**. Enter a subject, 1–480 minutes, optional YYYY-MM-DD due date and notes. Select the saved row to edit, complete, reopen or delete it. A completed session remains editable. Switch to **Notes** to keep longer reference material; select a note to read its full content or edit it.

The summary recalculates after each successful action. Dates are calendar dates, and overdue status compares against today's UTC date. This app is a planner and notes library; it does not run a timer or send reminders.

The host provides view switching, native search, row selection/details, edit forms, confirmed deletion, refresh, CSV export, reveal-data-folder, About and normal copy/paste/quit shortcuts. The worker rejects stale record versions so a failed or outdated edit cannot overwrite another saved change.

## Build and test the worker

From this project directory:

```sh
../../bin/arya check main.arya
mkdir -p .build
../../bin/arya build main.arya -o .build/worker --release --force
python3 smoke.py .build/worker
```

The existing native Arya SDK and C compiler build the worker. Python 3 is only the test controller. To inspect its machine interface directly:

```sh
DATA_FILE=/tmp/study-desk-inspection.json .build/worker list '{"view":"sessions"}'
```

The worker receives `COMMAND JSON_OBJECT` and prints exactly one JSON response. Expected failures return `{ok:false,message:...}` with exit status 0, as required by the desktop host protocol. Successful replies contain `ok`, `message`, `rows` and `summary` for the requested view after the action.

`list`, `session-add`, `session-edit`, `session-complete`, `session-reopen`, `session-delete`, `note-add`, `note-edit`, `note-delete`.

Session fields: `{title,minutes,due,description}`. Note fields: `{title,content}`. Selection actions additionally require the displayed `id` and `version`. `body.view` is `sessions` or `notes`. Native form values are strings; IDs/versions also accept the numeric snapshot values.

## Data and limits

The native host stores JSON under `~/Library/Application Support/Arya Native/study-desk/data.json`. `DATA_FILE` overrides this location for isolated testing; the parent directory must exist. The standalone worker defaults to `data.json` in its working directory. Existing invalid data fails visibly and is never silently replaced.

Mutations write a sibling temporary file and rename it only after validation. Failed persistence returns an error and preserves the prior store. The host provides a single-instance data-file lock; direct worker calls must use one writer at a time. Atomic replacement is not a power-loss/fsync guarantee. Keep backups of important data.

1000 sessions and 500 notes. Titles: 160 characters; session notes: 4000; saved note content: 12000. Durations: 1–480 minutes. The persisted JSON is capped at 2 MiB. The worker validates loaded records before returning a snapshot. The target is macOS ARM64 with the local AppKit host; other platforms are outside this package.

See [REPORT.md](REPORT.md) for actual implementation steps, test results and limits.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
