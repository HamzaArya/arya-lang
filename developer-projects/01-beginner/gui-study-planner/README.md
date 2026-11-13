# Study Planner

Create study sessions with duration estimates, toggle completion, remove sessions and see remaining study minutes immediately.

This is a complete, deliberately small GUI application implemented in native Arya. The developer level is a simulated learning track, not a claim that a human participant was observed.

## Run

From the repository root:

```sh
cd developer-projects/01-beginner/gui-study-planner
PORT=4102 ../../../bin/arya run main.arya
```

Open http://127.0.0.1:4102. Enter a subject and 1–480 minutes, then Add session. Use the visible session ID to toggle completion or remove it. The plan and remaining time update after each request without a reload. This is a planning app; it does not run a timer or deliver notifications.

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
