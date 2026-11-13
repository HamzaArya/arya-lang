# Native data qualification evidence

The [performance report](../../native-data-performance.md) explains the workloads,
measurement boundaries, results, and limits. All amounts and expected outputs are
identical between compared implementations. These are local Darwin ARM64 results.

`baseline-source.json` describes the initial dirty checkout at revision
`5ea5cdb52b665f2d02ab73483154f14555b79cc6`. `qualified-source.json` describes the
frozen final source at revision `28d27826ae74386dc81a652d24752409c6e2fb6a` plus its
recorded working-tree changes. A version string or Git revision alone does not
identify either build. Each record includes per-file hashes, dependency
provenance, toolchain/environment information, and the source archive hash.

The complete source archives remain in
`.build/performance-2026-11-12/{baseline,qualified}-source.tar.gz` in the Arya
checkout. They include the vendored bootstrap dependencies; they are intentionally
kept outside the documentation bundle. `qualified-compiler.json` identifies the
compiler rebuilt from the C seed and its byte-identical stage-two/stage-three C.
The compiler recorded inside `qualified-source.json` was the starting checkout
compiler; use `qualified-compiler.json` for the compiler actually qualified.

`ledger-source.json` identifies the unchanged reference application sources and
generated JavaScript oracles. The controllers copy calculation modules into
Arya's build directory. They never write into Ledger. Application host adapters
are used unchanged by the pool benchmark; its generated admission manifests live
beside the benchmark executables in Arya's build directory.

- `qualified-controlled-results.json`: headline direct persistent worker measurements,
  separate phase binaries, host encoding/decoding, allocation diagnostics and RSS.
- `ledger-pool-qualified.json`: the existing application's complete pool boundary,
  with the baseline and candidate linked to the same frozen static SDK.
- `startup-qualified-controlled.json`: fresh processes, warm filesystem, an empty report,
  module initialization, transfer and cleanup.
- `qualified-workloads/`: final scalar/data kernels, bounded CSV reporting,
  forced build cost, and runtime/editor audit samples.
- `qualified-suite.json` and `qualified-*.log`: exact commands, outcomes and logs.
- `qualified-sdk-delivery.json`: relocated SDK code hashes, isolated builds,
  output checks, dependency inspection, and documentation-link checks. The local
  SDK is `.build/performance-2026-11-12/sdk`; its own `SHA256SUMS` covers the bundle.
- `stages/`: executable/generated-C identities and compatibility outcomes for
  retained intermediate builds. Earlier result files retain their original
  sessions, outliers and boundaries; they are not pooled with final samples.
- `baseline-allocation-detail.json`: extra allocation instrumentation injected
  into a separate baseline counter binary; the timed baseline was unchanged.

`baseline-controlled` relinks the initial baseline's byte-identical emitted C
with the frozen candidate SDK. This removes the original shared SDK directory
from the final comparison. Original baseline executables and earlier sessions
remain intact. `qualified-results.json`, `ledger-pool-qualified-first.json`, and
`startup-qualified.json` retain the first final sessions. `qualified-confirmation.json`
compares the previous optimized stage with the combined candidate in one session.
In `qualified-workloads/kernels.json` and `build-cost.json`, `candidate` names the
qualified compiler; the top-level older `kernels.json` describes its earlier stage.

Timing binaries omit allocation counters and GC timers. `calloc` request bytes
exclude reallocations, independent malloc users, libmpdec, mark worklists, and
allocator metadata. They measure allocation traffic, not simultaneously resident
memory. RSS is measured separately. Native phase read wall time includes idle
pipe waits; Node readline decoding lies outside its phase timer. Validation is
the retained envelope length guard; decimal row validation remains inside the
calculation phase. Phase medians therefore should not be added to reconstruct an
uninstrumented round trip.

`SHA256SUMS` covers every file in this evidence directory except itself. Node and
Python are optional controllers/oracles. The C bootstrap, self-hosted compiler,
SDK and generated applications run independently of both.
