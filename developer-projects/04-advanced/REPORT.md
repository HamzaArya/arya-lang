# Advanced developer report

This is an AI-simulated developer track. Three complete, scoped native Arya applications were built; no human testing or developer identity is implied.

| Project | Finished behavior | Evidence |
| --- | --- | --- |
| [TextVault Manifest](cli-backup-manifest/README.md) | SHA-256 text-tree manifests, add/change/remove verification, safe exclusive publication | [Report](cli-backup-manifest/REPORT.md) |
| [Flowboard](gui-project-board/README.md) | Task board, assignees, persistent states, revision checks and Doing limit of three | [Report](gui-project-board/REPORT.md) |
| [Workline Queue](service-job-queue/README.md) | Idempotent jobs, lease expiry, stale completion protection, failure/retry and persistence | [Report](service-job-queue/REPORT.md) |

All three final versions passed native checking, release builds, and integration tests. Flowboard uses an explicit resumed smoke record: its original command failed a startup deadline, and the unchanged binary passed a captured retry. The original failed result remains in the evidence.

Final verification is captured in [results.json](results.json), with source/binary hashes and command logs. GUI browser interaction checks are reported by the coordinating agent separately from HTTP checks. The app runtime and domain operations are native Arya; Python is test tooling only.

Work progressed from native API inspection, to explicit domain rules and failure behavior, to release builds and black-box integration tests. Tests found a macOS `/var` versus `/private/var` path-containment mistake, which was corrected by canonicalizing the manifest parent. Source review found that `fs.publish` hard-links without deleting the original, so manifest creation now stages in a private temporary directory and always cleans up. A regression preserves a preexisting `.tmp` symlink and its target. A broad text edit briefly broke a test function; Python compilation caught it before success could be reported. Web apps use a hardcoded `any` options boundary to work around an unresolved structural checker rejection.

No app was abandoned. TextVault deliberately stops at UTF-8 text integrity: public native filesystem reads are text-based, so arbitrary binary backup fidelity cannot be promised. It is not a file copier. Flowboard uses explicit refresh after mutations. Workline is a real worker coordination API; the worker performs its own task, and delivery is at least once. Distributed execution, fsync-level crash durability and multi-process storage are outside these completed app scopes. Individual READMEs state concrete limits.

## Superseding 2.0.0 language repairs

The earlier server-options checker finding is resolved: both web applications now use inferred readonly options without `any`, and their migrated builds and workflow/storage tests passed. TextVault now hashes original binary bytes through `fs.readBytesSync` and `security.hashBytes`; independent byte-digest and corruption checks passed. Its earlier text-only API restriction no longer applies, although file copying/restoration remains outside this integrity-manifest application's scope. Stateful stores now use `fs.writeTextAtomicSync` and reject existing/dangling store links. See [API repair evidence](../../docs/native-api-repairs.md), [the binary upgrade report](cli-backup-manifest/REPORT.md), and [the release report](../../docs/native-release-2.0.0.md). Original records above are preserved as first-delivery history.
