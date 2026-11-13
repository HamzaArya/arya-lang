# Six developer tracks: 18 Arya applications

Six simulated developer skill levels each build one CLI, one browser GUI, and one HTTP service. These are working native Arya projects with bounded, documented scope, not claims about six human participants or production qualification. Python is used only for verification tooling. Browser scripting is provided by Arya's UI library; the server and business logic compile from Arya.

## Run an application

From the repository root, use the existing native SDK (`./bin/arya --version`). If it is absent, follow the repository installation guide and `make native-sdk`.

```sh
./developer-projects/run.sh 01-beginner/cli-expenses help
PORT=4311 ./developer-projects/run.sh 01-beginner/gui-study-planner
PORT=4312 ./developer-projects/run.sh 01-beginner/service-notes
```

Open the printed loopback URL for a GUI. Use each service's documented endpoints for API calls. Stop servers with Ctrl-C. Each README documents the application's arguments, data format, and examples. `DATA_FILE=/absolute/path/state.json` selects isolated storage for stateful applications; otherwise the default file lives in that project's working directory. Run only one instance per data file. `ARYA=/absolute/path/to/arya` selects a different SDK.

These GUIs are browser applications. Native AppKit windows, installers, cloud deployment, authentication for public hosting, and other-platform qualification are not included. Services bind to loopback and use local JSON storage where persistence is needed. Read each README for exact limits.

The later native-software requests are delivered separately as
[six native desktop applications](../native-desktop-projects/README.md) and
[six native calculators](../native-calculators/README.md). The
[release work report](../docs/native-release-2.0.0.md) records the language repairs
that followed this original collection.

## Project catalog

| Developer track | CLI | GUI | Service |
| --- | --- | --- | --- |
| [Beginner](01-beginner/REPORT.md) | [Expense notebook](01-beginner/cli-expenses/README.md) | [Study planner](01-beginner/gui-study-planner/README.md) | [Notes API](01-beginner/service-notes/README.md) |
| [Better](02-better/REPORT.md) | [Inventory manager](02-better/cli-inventory/README.md) | [Habit tracker](02-better/gui-habit-tracker/README.md) | [Bookmark API](02-better/service-bookmarks/README.md) |
| [Intermediate](03-intermediate/REPORT.md) | [Log analyzer](03-intermediate/cli-log-analyzer/README.md) | [Support desk](03-intermediate/gui-support-desk/README.md) | [Reservation API](03-intermediate/service-reservations/README.md) |
| [Advanced](04-advanced/REPORT.md) | [Backup manifest](04-advanced/cli-backup-manifest/README.md) | [Project board](04-advanced/gui-project-board/README.md) | [Job queue API](04-advanced/service-job-queue/README.md) |
| [Pro](05-pro/REPORT.md) | [Ledger audit](05-pro/cli-ledger-audit/README.md) | [Incident console](05-pro/gui-incident-console/README.md) | [Feature flag API](05-pro/service-feature-flags/README.md) |
| [World class](06-world-class/REPORT.md) | [Release evidence gate](06-world-class/cli-release-gate/README.md) | [Reconciliation workbench](06-world-class/gui-reconciliation/README.md) | [Idempotent ledger API](06-world-class/service-idempotent-ledger/README.md) |

Final status: **18/18 native check/build/workflow tests passed**; all six GUIs also have browser interaction evidence. See the [master report](REPORT.md) and [source-matched acceptance record](reports/acceptance.json).

## Reproduce verification

Requires Python 3 for the test controller and the C toolchain used by Arya. Applications themselves do not run through Python or Node.

```sh
python3 developer-projects/verify.py
python3 developer-projects/verify.py --filter 06-world-class
python3 developer-projects/verify.py --filter gui-study-planner --check-only
```

The full command checks source, builds native release executables into each project's ignored `.build/verified-app`, and runs its black-box `smoke.py`. Tests use temporary data and start/stop their own servers. The runner continues after a failed project, returns nonzero if any project fails, and writes timestamped logs and JSON results under `reports/`. It records compiler identity and source hashes so evidence can be tied to the tested version.

Every project has a `REPORT.md` with actual implementation work, encountered errors, fixes, limitations, and abandonment status. Track reports summarize the three projects. [REPORT.md](REPORT.md) consolidates results, blockers, and GUI verification.
