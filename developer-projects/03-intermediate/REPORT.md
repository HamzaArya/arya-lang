# Intermediate developer report

This is an AI-simulated developer track. Three complete, scoped native Arya applications were built; no human testing or developer identity is implied.

| Project | Finished behavior | Evidence |
| --- | --- | --- |
| [Signal Log](cli-log-analyzer/README.md) | JSONL severity/service summaries, malformed-line accounting and average/p95 latency | [Report](cli-log-analyzer/REPORT.md) |
| [Harbor Support](gui-support-desk/README.md) | Customer tickets, priority, triage states, revision checks and persistent storage | [Report](gui-support-desk/REPORT.md) |
| [Roomkeeper](service-reservations/README.md) | UTC room booking, overlap conflict, adjacency, room filter and cancellation | [Report](service-reservations/REPORT.md) |

All three final source versions passed `arya check`, native release builds, and Python-driven CLI/HTTP integration tests. The applications themselves use native Arya, not Python or Node. [results.json](results.json) collects matching source/binary hashes and complete command evidence. GUI browser interaction checks are reported by the coordinating agent separately from HTTP checks.

Work progressed from reading the current native API contracts, through domain implementation and documentation, to build and integration testing. Actual friction included nullable CLI arguments, an old binary tested after priority was added, a `ui.select` option-shape mistake exposed only by rendering, and an apparent structural checker issue after adding a relocation-safe web root. Reports preserve these failures and fixes. An `any` annotation on the hardcoded server-options record works around the unresolved checker issue; runtime options validation remains active.

No app was abandoned. Support cards use a visible refresh link after mutations. Services intentionally run locally with one process per JSON file; authentication, external calendar/email integration and multi-process databases are outside their finished scope. Corrupt data fails visibly; write failures never acknowledge a mutation or alter live state. SIGTERM shutdown and persisted state across restart are tested.
