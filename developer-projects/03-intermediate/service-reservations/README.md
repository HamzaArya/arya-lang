# Roomkeeper

Reserve rooms for UTC time intervals, reject overlaps, allow adjacent bookings, filter by room, and cancel bookings.

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
PORT=4313 DATA_FILE=data.json .build/app
curl -s http://127.0.0.1:4313/health
curl -s -X POST http://127.0.0.1:4313/reservations -H 'Content-Type: application/json' -d '{"room":"Atlas","owner":"Sam","start":"2026-12-01T10:00:00Z","end":"2026-12-01T11:00:00Z"}'
curl -s 'http://127.0.0.1:4313/reservations?room=Atlas'
```

Use `DELETE /reservations/:id` to cancel. HTTP 201 creates, 400 rejects input/date/range errors, 409 rejects overlap, and 404 identifies missing cancellation targets. Intervals are half-open: an 11:00 end permits another 11:00 start. Dates are normalized by `std datetime` before comparison.

Storage is a JSON snapshot at `DATA_FILE` (default `data.json` in the working directory). Run one app process per data file. Mutations use `fs.writeTextAtomicSync` before publishing in memory. This is atomic replacement, not an fsync/power-loss durability guarantee. Existing malformed storage aborts startup visibly. Keep a copy of the JSON file to back up data. The service binds only 127.0.0.1 and shuts down on SIGINT/SIGTERM.

## Scope and limits

Local scheduling service with a 1000-booking limit. No authentication, recurring bookings, calendar-provider integration or multi-process database. Room names are case-sensitive. UTC timestamps avoid local timezone assumptions.

See [REPORT.md](REPORT.md) for actual implementation and verification evidence.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
