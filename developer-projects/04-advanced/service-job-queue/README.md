# Workline Queue

Coordinate local workers with durable jobs, idempotent submission, expiring claims, stale-lease rejection, completion/failure and explicit retries.

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
PORT=4413 DATA_FILE=data.json .build/app
curl -s -X POST http://127.0.0.1:4413/jobs -H 'Content-Type: application/json' -d '{"key":"report:1","task":"Render monthly report"}'
curl -s -X POST http://127.0.0.1:4413/jobs/claim -H 'Content-Type: application/json' -d '{"seconds":60}'
curl -s http://127.0.0.1:4413/jobs
```

A claim returns a job ID and secret lease token. A worker performs the work and calls `POST /jobs/:id/finish` with `{lease,state,result}`, where state is `done` or `failed`. `POST /jobs/:id/retry` requeues only failed work. Empty claims return 204. Claims expire and can be taken by another worker; stale tokens cannot finish reclaimed work. Submission with the same key/task returns the existing ID, while the same key with different work returns 409. `GET /jobs` deliberately omits lease tokens. `GET /health` reports readiness.

Storage is a JSON snapshot at `DATA_FILE` (default `data.json` in the working directory). Run one app process per data file. Mutations use `fs.writeTextAtomicSync` before publishing in memory. This is atomic replacement, not an fsync/power-loss durability guarantee. Existing malformed storage aborts startup visibly. Keep a copy of the JSON file to back up data. The service binds only 127.0.0.1 and shuts down on SIGINT/SIGTERM.

## Scope and limits

Local worker protocol, not an arbitrary command runner. No built-in worker executes submitted task text. 1000-job cap, no deletion/history compaction, no lease heartbeat. Delivery is at least once: expired claims can repeat external work, so worker effects must be idempotent. Wall clock controls leases. No multi-process writers or distributed consensus.

See [REPORT.md](REPORT.md) for actual implementation and verification evidence.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
