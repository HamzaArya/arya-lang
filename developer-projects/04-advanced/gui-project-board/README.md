# Flowboard

Plan release work in Backlog/Doing/Done columns with assignees, descriptions, durable records, revision conflicts and a three-task work-in-progress limit.

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
PORT=4412 DATA_FILE=data.json .build/app
```

Open <http://127.0.0.1:4412>. Create a task with an assignee and details. Refresh the board after saving. Move cards into Doing to start work; a fourth Doing task returns a clear error until work leaves that column. Move to Done when finished, or delete obsolete tasks. Revision checks reject changes made from stale browser pages.

API: `GET /api/items`; `POST /api/items` with `{title,owner,detail}`; `PATCH /api/items/:id` with `{status,version}`; `POST /api/items/:id/delete` with `{version}`; `GET /health`. Status values are `Backlog`, `Doing`, `Done`.

Storage is a JSON snapshot at `DATA_FILE` (default `data.json` in the working directory). Run one app process per data file. Mutations use `fs.writeTextAtomicSync` before publishing in memory. This is atomic replacement, not an fsync/power-loss durability guarantee. Existing malformed storage aborts startup visibly. Keep a copy of the JSON file to back up data. The service binds only 127.0.0.1 and shuts down on SIGINT/SIGTERM.

## Scope and limits

Single local operator, 200 tasks, no login, drag-and-drop, realtime collaboration or external issue sync. Uses native Arya web/ui and the browser; no Node/Python backend. Explicit refresh after mutations.

See [REPORT.md](REPORT.md) for actual implementation and verification evidence.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
