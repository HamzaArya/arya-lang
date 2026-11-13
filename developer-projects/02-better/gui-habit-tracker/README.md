# Habit Garden

Create habits, check in for a chosen calendar date, undo a check-in and view the saved history.

This is a complete, deliberately small GUI application implemented in native Arya. The developer level is a simulated learning track, not a claim that a human participant was observed.

## Run

From the repository root:

```sh
cd developer-projects/02-better/gui-habit-tracker
PORT=4202 ../../../bin/arya run main.arya
```

Open http://127.0.0.1:4202. Create a named habit, enter its visible ID, choose a date and press Check in / undo. The same action removes an existing check-in for that date. Remove habit deletes its history. Habit names are unique case-insensitively. Each habit holds up to 366 dates; the initial date is today in UTC, and you may choose another date. No reminders or inferred streak calculation.

## Build and verify

From this project directory, with the existing native SDK built:

```sh
../../../bin/arya check main.arya
mkdir -p .build
../../../bin/arya build main.arya -o .build/app --release --force
python3 smoke.py .build/app
```

The executable runs directly without Python, Node or the compiler. Python 3 is only the black-box acceptance test driver. GUI projects use Arya's `std ui` browser assets with native Arya HTTP logic.

## Data and operation

`DATA_FILE=/absolute/path/store.json` overrides the default `data.json` in the current working directory. Its parent directory must exist. Each update uses `fs.writeTextAtomicSync` with a private random sibling and atomic replacement; failed writes are reported before service state is committed. Malformed existing JSON or an invalid schema fails startup visibly rather than resetting the file. Keep a backup if the data matters.

The app supports at most 1000 records and a bounded JSON snapshot under 1 MiB. Run only one process per data file; there is no cross-process lock or power-loss durability guarantee. HTTP listens on 127.0.0.1; PORT selects the port, including 0 for OS assignment. SIGINT/SIGTERM drains the server. This is a local single-user app without authentication or TLS. Requests are capped at 16 KiB.

See [REPORT.md](REPORT.md) for actual implementation and test evidence, difficulties and limits.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
