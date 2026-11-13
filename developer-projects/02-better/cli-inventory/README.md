# Stockroom

Manage products by unique SKU, receive or consume stock, list low-stock items and prevent negative inventory.

This is a complete, deliberately small CLI application implemented in native Arya. The developer level is a simulated learning track, not a claim that a human participant was observed.

## Run

From the repository root:

```sh
cd developer-projects/02-better/cli-inventory
../../../bin/arya run main.arya -- add PEN "Blue pen" 5 2
../../../bin/arya run main.arya -- adjust PEN -3
../../../bin/arya run main.arya -- low
../../../bin/arya run main.arya -- list
../../../bin/arya run main.arya -- adjust PEN -2
../../../bin/arya run main.arya -- delete PEN
```

SKU matching is case-sensitive. Stock and reorder thresholds are integers from 0 to 1,000,000. Adjustments may be negative but cannot make stock negative. Delete permits only zero-stock products. This is a stock register, without purchase orders, prices or warehouse synchronization.

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

The app supports at most 1000 records and a bounded JSON snapshot under 1 MiB. Run only one process per data file; there is no cross-process lock or power-loss durability guarantee. Invalid commands and values return exit status 1; successful commands return 0. list/summary output is machine-readable JSON.

See [REPORT.md](REPORT.md) for actual implementation and test evidence, difficulties and limits.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
