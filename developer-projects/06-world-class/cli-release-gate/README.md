# Release evidence gate

Evaluate build, unit, integration and security evidence for one revision. Require passed checks with positive test counts, at least 80% coverage, zero critical findings and a rollback procedure. Explain every rejected gate.

## Run

From this project directory in the Arya repository:

```sh
../../../bin/arya run main.arya -- sample-evidence.json
```

With a matching installed native SDK, replace `../../../bin/arya` with `arya`. Build and run independently:

```sh
mkdir -p .build
../../../bin/arya check main.arya
../../../bin/arya build main.arya -o .build/app --release --force
.build/app sample-evidence.json
python3 smoke.py .build/app
```

Python is used only for the integration test controller. The application is native Arya and does not need Python or Node at runtime. A C compiler and the complete Arya SDK are needed to build it.

## Scope and verification

Evaluates supplied evidence only; it does not independently run CI, authenticate evidence, inspect a remote repository or deploy. Required checks and coverage policy are deliberately fixed and visible in source. Up to 100 checks and a 1 MiB file. Exit 0 permits, 1 blocks, 2 is malformed input/usage.

`smoke.py` checks real executable behavior, including positive and negative domain cases. Stateful applications additionally verify persistence after restart, corruption rejection and failed-write preservation. GUI tests inspect emitted HTML and API behavior; browser interaction evidence belongs in the root report.

See [REPORT.md](REPORT.md) for implementation notes and actual problems encountered. Skill labels describe a simulated project brief, not a claim that six humans performed this work or that a local app is production qualified.
