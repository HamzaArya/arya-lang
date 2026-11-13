# Incident console

Create incidents with priority and ownership, advance open → investigating → resolved, and preserve each update note. The browser form invokes native Arya routes. The board escapes user content and shows the complete transition history.

## Run

From this project directory in the Arya repository:

```sh
PORT=8512 ../../../bin/arya run main.arya
```

With a matching installed native SDK, replace `../../../bin/arya` with `arya`. Build and run independently:

```sh
mkdir -p .build
../../../bin/arya check main.arya
../../../bin/arya build main.arya -o .build/app --release --force
.build/app
python3 smoke.py .build/app
```

Python is used only for the integration test controller. The application is native Arya and does not need Python or Node at runtime. A C compiler and the complete Arya SDK are needed to build it.

The executable binds to `127.0.0.1:8512` by default. Set `PORT` to choose another port. For GUI projects open `http://127.0.0.1:8512/` in a browser. Press Ctrl-C to stop gracefully.

## API and persistence

- `GET /` displays the GUI; `GET /incidents` exports persisted incidents.
- `POST /incidents`: `{"title":"API errors","owner":"Sam","priority":"P1"}`.
- `POST /transition`: `{"id":"1","status":"investigating","note":"Examining the last deploy"}`; then resolve with another note.

All services provide `GET /health`. Send JSON with `Content-Type: application/json`. Malformed inputs return 400; missing records return 404; conflicts and capacity limits return 409; persistence failures return 503. Unknown paths return 404.

`DATA_FILE` selects the JSON store (default `data.json` in the working directory). The parent directory must exist. Changes use `fs.writeTextAtomicSync` before in-memory state changes or success responses. Syntactically or structurally corrupt state aborts startup without replacing the file. The maximum stored JSON is 1 MiB. Keep one process per store; atomic replacement is not a multi-writer transaction or a power-loss/fsync durability guarantee. These are local apps; use trusted local input.

## Scope and verification

Single operator/local trusted team tool; no login, notifications, timers or external pager integration. Maximum 1,000 incidents and 1 MiB stored data. Refresh board after actions to update the server-rendered table. Resolved incidents cannot reopen.

`smoke.py` checks real executable behavior, including positive and negative domain cases. Stateful applications additionally verify persistence after restart, corruption rejection and failed-write preservation. GUI tests inspect emitted HTML and API behavior; browser interaction evidence belongs in the root report.

See [REPORT.md](REPORT.md) for implementation notes and actual problems encountered. Skill labels describe a simulated project brief, not a claim that six humans performed this work or that a local app is production qualified.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
