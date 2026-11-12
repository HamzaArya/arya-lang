# Incremental implementation roadmap

This executes the [master plan](arya-master-plan.md) using the
[current audit](architecture-audit.md) and [target architecture](architecture-target.md).
A feature is complete only for its recorded acceptance scope. No release date,
universal performance claim or stable financial qualification is implied.

| Stage / milestone | Work | Exit evidence / dependencies | Current disposition |
| --- | --- | --- | --- |
| 1A: current architecture | Inventory active frontend/runtime/tooling/interop; classify gaps and compatibility | Reviewed code-path map, gap table, backend evaluation, explicit missing/unverified surfaces | Audit/design documents prepared in this milestone |
| 1B: regression gate | Fix build blockers, preserve passive analysis and current examples, reconcile active status | Docs/format/type checks, full regression suite, clean consumer installs, no breaking syntax | Local alpha.11 regression passed; exact snapshot/runtime records in the milestone report |
| 2A: exact calculation kernel | Bounded invoices/ledgers; portable/reference/native comparison; lightweight independent runtime | Nine signed rounding modes, overflow/scale checks, Python reference, malformed ABI, sanitizer and fresh-package tests; retained size/RSS/timing data | Local prototype verified within the milestone report scope; production/platform gates remain open |
| 2B: exact value types | Library Money values with currency mismatch rejection, ISO data versioning, explicit integer/decimal conversions | Independent currency vectors, typed/mutable-boundary tests, schema/serialization migration review | Planned; batch currency tags are not this feature |
| 2C: arithmetic breadth | Decimal128 decision, arbitrary integers/decimals, FX source/time records, allocation primitives | Chosen standards/contexts and equivalent external reference calculations | General decimal wrapper exists; remaining work planned |
| 3A: typed IR | Shared lowering, verifier, CFG/effects/conversions, deterministic IR/source locations | Execute a real bounded subset and test verifier failures; retain JS compatibility | Scalar structured IR and verifier implemented in alpha.12; broader effects/types missing |
| 3B: minimal native executable | Evaluate LLVM/Cranelift/C on the same typed IR, then select backend | Actual hello/calculator binary, no Node/Python at execution, checked semantics, debug/release evidence | LLVM scalar executable preview implemented in alpha.12; production backend comparison and broad qualification remain open |
| 3C: native runtime/coverage | Functions, modules, collections, GC roots, runtime errors and linking | Stress/sanitizer/differential tests and qualified x86-64/ARM64 OS matrix | Planned; historical runtime is reference evidence only |
| 3D: deployment targets | OS SDK/linker story, incremental objects, deterministic builds, cross-target and Wasm work | Run resulting executables on actual targets; separate object-generation from execution evidence | Planned |
| 4A: C ABI | Versioned values/status/ownership/thread contract | C consumer, invalid inputs, allocation/free and exception translation tests | Planned |
| 4B: host bindings | Official Node/Python packages, array interchange, optional Wasm/browser binding | Bidirectional exactness/lifetime/async tests and dependency-free native executables | Node/Python JSON integration exists; official native bindings incomplete |
| 5A: enterprise libraries | PostgreSQL/SQLite, migrations/isolation, exact database mappings | Disposable databases, rollback/ambiguous-outcome tests and supported-driver matrices | MySQL exists; other official adapters planned |
| 5B: accounting packages | Journals, trial balance, AR/AP, costing, periods, payroll primitives, FX/reconciliation/statements | Per-operation invariants, reference/property tests, independent modules and audit data | Batch aggregation only; domain packages missing |
| 5C: developer ecosystem | Complete actual CLI command set, REPL/docs/bench/doctor; IDE coverage | Real commands/examples, editor/debug host tests, no placeholder promises | Existing CLI/LSP/editor subset implemented |
| 5D: package management | Manifest/lock/resolution/integrity/threat model before registry | Reproducible local installs, dependency confusion/lifecycle tests; publishing separately authorized | npm workflow implemented; independent manager planned |
| 6: production qualification | Broad fuzzing, profiles, signed artifacts, support policy, external review | Exact-revision platform logs, independent review, owner-selected signing/maintenance commitments | Open; experimental candidates remain experimental |

## Native 2.0 independence migration

The [independent compiler](native-independence.md) now bootstraps and compiles without Node/Python. Its native runtime and core libraries are verified separately. The [function manifest](../native/manifest.json) records partial/unported functions; full conversion remains in progress. The 1.3 Node implementation is retained for compatibility, not used by the native toolchain.

The [native performance and product development plan](native-performance-plan.md) defines the next development sequence from the 2.0.0-alpha.2 benchmark: reproducible profiling, efficient locals and calls, records/lists, verified native IR, strings/JSON, exact financial libraries, native tooling, and integrated qualification. Its effort ranges and performance objectives are planning targets; completed work requires fresh evidence.

## Current milestone boundary

The [alpha.11 milestone report](accounting-milestone.md) records actual checks,
failures, measurements, package identities and incomplete work.

Finish the audit/design and exact accounting kernel as an additive, reviewable
milestone. Keep the existing frontend, Node runtime, syntax, std decimal behavior,
JavaScript/Python interop and prior artifacts. Complete standalone runtime-package
acceptance and measured comparisons; do not describe native package code as a
standalone Arya compiler or a completed banking/accounting platform.

The [alpha.12 native milestone](native-milestone.md) now implements the first typed IR and native executable subset. Expand this subset only through further verified gates. Define its supported subset and memory semantics before
expanding coverage. Any breaking syntax/semantics change needs a separate approved
proposal; this roadmap is not approval to silently change existing programs.

## Reporting and benchmark protocol

Every milestone report records implemented scope, executed commands/platforms,
passes, failures, skips, incomplete work, compatibility changes, measured behavior
and next steps. Keep raw benchmark samples and source/toolchain identities.
Compare equivalent algorithms, precision, bounds and data; show end-to-end cost
separately from prepared kernels and avoid comparing float loops with exact money.
Add Rust/C++/Java/Python/scientific workloads only as equivalent implementations
exist; an unrun comparator is a gap, not a benchmark result.

Use synthetic accounting fixtures or explicitly authorized application fixtures.
Arya Ledger remains independent and is not modified. Do not publish packages,
deploy services, rotate signing keys or mutate external projects as part of local
qualification. Local artifacts and release readiness are separate from publication.
