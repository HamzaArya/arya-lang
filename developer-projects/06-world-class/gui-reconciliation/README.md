# Statement reconciliation

Match statement references against book references with exact decimal amounts. Report mismatches, entries missing from either side, matched count and net difference. Persist the last 100 reconciliation summaries.

## Run

From this project directory in the Arya repository:

```sh
PORT=8612 ../../../bin/arya run main.arya
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

The executable binds to `127.0.0.1:8612` by default. Set `PORT` to choose another port. For GUI projects open `http://127.0.0.1:8612/` in a browser. Press Ctrl-C to stop gracefully.

## API and persistence

- `GET /` displays the GUI; `GET /runs` exports persisted report history.
- `POST /reconcile`: `{"label":"November","bank":"A,10.00\nB,5.00","book":"A,10.00\nB,4.00"}` returns the complete report and presentation message.

All services provide `GET /health`. Send JSON with `Content-Type: application/json`. Malformed inputs return 400; missing records return 404; conflicts and capacity limits return 409; persistence failures return 503. Unknown paths return 404.

`DATA_FILE` selects the JSON store (default `data.json` in the working directory). The parent directory must exist. Changes use `fs.writeTextAtomicSync` before in-memory state changes or success responses. Syntactically or structurally corrupt state aborts startup without replacing the file. The maximum stored JSON is 1 MiB. Keep one process per store; atomic replacement is not a multi-writer transaction or a power-loss/fsync durability guarantee. These are local apps; use trusted local input.

## Scope and verification

One currency/two decimal places. Paste reference,amount per line without a header; quoted CSV and commas inside references are not supported. Duplicate references fail rather than silently merge. Up to 500 rows per side, 50,000 text characters per side and 1 MiB stored history. Refresh history after a run. Source statement rows are not retained.

`smoke.py` checks real executable behavior, including positive and negative domain cases. Stateful applications additionally verify persistence after restart, corruption rejection and failed-write preservation. GUI tests inspect emitted HTML and API behavior; browser interaction evidence belongs in the root report.

See [REPORT.md](REPORT.md) for implementation notes and actual problems encountered. Skill labels describe a simulated project brief, not a claim that six humans performed this work or that a local app is production qualified.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
