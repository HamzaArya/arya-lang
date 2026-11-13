# Ledger audit

Read a JSON journal, verify unique entry ids, at least two lines per entry, exactly one positive debit/credit side per line, and exact entry balances. Emit machine-readable totals, signed account balances and all business-rule findings.

## Run

From this project directory in the Arya repository:

```sh
../../../bin/arya run main.arya -- sample-journal.json
```

With a matching installed native SDK, replace `../../../bin/arya` with `arya`. Build and run independently:

```sh
mkdir -p .build
../../../bin/arya check main.arya
../../../bin/arya build main.arya -o .build/app --release --force
.build/app sample-journal.json
python3 smoke.py .build/app
```

Python is used only for the integration test controller. The application is native Arya and does not need Python or Node at runtime. A C compiler and the complete Arya SDK are needed to build it.

## Scope and verification

No journal mutation or external accounting integration. One currency and two decimal places per file; up to 1,000 entries and 100 lines per entry within a 1 MiB input. Amount strings accept up to 18 integer digits. Exit 0 passes, 1 reports audit findings, 2 means malformed input/usage. An empty journal fails.

`smoke.py` checks real executable behavior, including positive and negative domain cases. Stateful applications additionally verify persistence after restart, corruption rejection and failed-write preservation. GUI tests inspect emitted HTML and API behavior; browser interaction evidence belongs in the root report.

See [REPORT.md](REPORT.md) for implementation notes and actual problems encountered. Skill labels describe a simulated project brief, not a claim that six humans performed this work or that a local app is production qualified.
