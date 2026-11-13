# Harbor Support

Manage a small local support queue with customer ownership, Normal/Urgent priority, descriptions, triage columns, deletion, and revision conflicts.

## Build and test

From this directory in the repository:

```sh
make check
make build
python3 smoke.py .build/app
```

`make` defaults to the repository's `../../../bin/arya`; set `ARYA=/path/to/arya` for an installed SDK. Arya and a C toolchain are needed to build; the resulting executable needs neither Python nor Node. Python 3 standard library drives integration tests only.

## Use

```sh
PORT=4312 DATA_FILE=data.json .build/app
```

Open <http://127.0.0.1:4312>. Enter a title, customer, priority and details, then select **Create ticket**. Select **Refresh board** to see the saved ticket. Move it through Open, Investigating and Resolved, or delete it. Every response gives a visible success/error message. Refresh after mutations; stale revisions return a conflict instead of overwriting a newer edit.

The same local API exposes `GET /api/items`, `POST /api/items` with `{title,owner,detail,priority}`, `PATCH /api/items/:id` with `{status,version}`, and `POST /api/items/:id/delete` with `{version}`. `GET /health` reports readiness.

Storage is a JSON snapshot at `DATA_FILE` (default `data.json` in the working directory). Run one app process per data file. Mutations use `fs.writeTextAtomicSync` before publishing in memory. This is atomic replacement, not an fsync/power-loss durability guarantee. Existing malformed storage aborts startup visibly. Keep a copy of the JSON file to back up data. The service binds only 127.0.0.1 and shuts down on SIGINT/SIGTERM.

## Scope and limits

Single local operator; no login, email delivery, attachments, SLA clock, or shared-process writes. Board limited to 200 tickets. Browser UI uses Arya ui-generated JavaScript for request actions; native Arya owns the app and storage. Refresh is explicit.

See [REPORT.md](REPORT.md) for actual implementation and verification evidence.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
