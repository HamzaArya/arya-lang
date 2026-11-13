# 06-world-class developer track

Three complete bounded application briefs implemented in native Arya. This is a simulated developer experience, not a study with human subjects. Each project has its own source, README, executable integration controller and work report.

| Project | Kind | Report |
| --- | --- | --- |
| [cli-release-gate](cli-release-gate/README.md) | cli | [work log](cli-release-gate/REPORT.md) |
| [gui-reconciliation](gui-reconciliation/README.md) | gui | [work log](gui-reconciliation/REPORT.md) |
| [service-idempotent-ledger](service-idempotent-ledger/README.md) | service | [work log](service-idempotent-ledger/REPORT.md) |

Initial compiler checks passed. No project was abandoned. Runtime/deployment limits and root review corrections are explicit in each report. Final automated results are in `verification.json`; root browser evidence is recorded separately.

## Final result

All 3 projects passed fresh native checks, release builds and integration tests. [Exact evidence](../reports/20261113T133315.776053Z/results.json); [track summary](verification.json). Reconciliation passed the regression for normalized whole totals and wider accumulated totals across restart. Ledger tests verify exact large balances, normalized idempotent retries, conflicting retries, overdrafts, failed persistence and corrupt-store rejection.
