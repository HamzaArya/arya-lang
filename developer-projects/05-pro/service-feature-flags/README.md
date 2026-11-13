# Feature flag service

Maintain named flags with enable switches, percentage rollout and optimistic versions. Evaluate a stable subject/key bucket so the same subject receives consistent treatment. Updates reject stale versions.

## Run

From this project directory in the Arya repository:

```sh
PORT=8513 ../../../bin/arya run main.arya
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

The executable binds to `127.0.0.1:8513` by default. Set `PORT` to choose another port. For GUI projects open `http://127.0.0.1:8513/` in a browser. Press Ctrl-C to stop gracefully.

## API and persistence

- `GET /flags` lists flags.
- `POST /flags`: `{"key":"new-dashboard","enabled":true,"rollout":50,"version":0}` creates version 1; supply current version for an update.
- `POST /evaluate`: `{"key":"new-dashboard","subject":"customer-42"}` returns enabled, bucket and version.
- Bucket: iterate UTF-16 code units of `key + ":" + subject`, applying `(bucket * 31 + codeUnit) % 10000`; enabled requires flag enabled and bucket below `rollout * 100`.

All services provide `GET /health`. Send JSON with `Content-Type: application/json`. Malformed inputs return 400; missing records return 404; conflicts and capacity limits return 409; persistence failures return 503. Unknown paths return 404.

`DATA_FILE` selects the JSON store (default `data.json` in the working directory). The parent directory must exist. Changes use `fs.writeTextAtomicSync` before in-memory state changes or success responses. Syntactically or structurally corrupt state aborts startup without replacing the file. The maximum stored JSON is 1 MiB. Keep one process per store; atomic replacement is not a multi-writer transaction or a power-loss/fsync durability guarantee. These are local apps; use trusted local input.

## Scope and verification

Local single-process flag authority; no distributed replication or identity/authentication layer. Up to 1,000 flags within 1 MiB. Rollout uses a documented stable polynomial bucket, not a cryptographic allocation algorithm.

`smoke.py` checks real executable behavior, including positive and negative domain cases. Stateful applications additionally verify persistence after restart, corruption rejection and failed-write preservation. GUI tests inspect emitted HTML and API behavior; browser interaction evidence belongs in the root report.

See [REPORT.md](REPORT.md) for implementation notes and actual problems encountered. Skill labels describe a simulated project brief, not a claim that six humans performed this work or that a local app is production qualified.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
