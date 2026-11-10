# Tooling selection record

**Status, 9 November 2026:** no external learner feedback has been collected, as confirmed by the owner. M8's selection process is prepared. This record does not turn an engineering preference into a user finding or declare M8's evidence gate complete.

M3 already introduced same-file lexical go-to-definition, multiple semantic diagnostics, and preservation of completion/Outline data when semantic errors exist. Those implemented features belong to M3's evidence and acceptance; do not count them as a newly validated external-user investment.

## Current implementation update — 10 November 2026

The owner subsequently requested asynchronous Python integration, easier UI/animations, and richer editor setup. These shipped in 1.2.0-alpha.4. Their acceptance is engineering evidence from the [release record](release-readiness.md), not external learner observations.

- Managed/async Python clients and batches are implemented; direct calls retain their synchronous contract.
- Standard-library hints, semantic token roles, offline extension installation, themes/icons, and spelling Quick Fixes are implemented. Arbitrary dependency introspection, rename, and signature help remain deferred.
- UI components, forms/actions, motion, Electron starters, and an embedded implementation guide are implemented and have local browser/desktop checks.

The tables below retain the original decision rationale. Current implementation supersedes the earlier worker deferral; external-user selection gates remain open.

## Runtime focus decision — 10 November 2026

The owner selected the recommendation to focus on Node.js application development. The 1.3 source candidate retires the second compiler/runtime and targets consistent Python/npm integration, application libraries, and editor behavior. [Migration](node-runtime.md) documents the compatibility cost. [Runtime tests](../tests/node-runtime.test.ts) cover retired request errors, passive standard-library validation, and the reduced public surface. Historical native evidence remains history rather than active roadmap scope.

## Admissible evidence

A tooling investment may be justified by an actual M7 observation or a release-critical engineering risk with a reproducible trigger. Source review, automated tests, platform failures, and benchmarks are engineering evidence. They cannot substitute for observing a learner's understanding or establish how many users are affected.

| Evidence ID | Existing engineering evidence | Implication |
| --- | --- | --- |
| ENG-001 | The roadmap's source-map acceptance fixture requires a failing dependency/user frame to point to original Arya source. M1 tests exercise line/UTF-16 mapping and unmapped runtime regions. | Preserve and qualify mapped failures in every new execution path. This does not by itself justify an interactive debugger. |
| ENG-002 | M2 documents lexical scope timing, unknown-name checks, const writes, and the host allowlist; M3 tests and LSP acceptance exercise these contracts. | Maintain one resolver and diagnostics/navigation data across clients. No separate editor-specific resolver is justified. |
| ENG-003 | M4's required graph tests include containment, canonical file identity, cycles, dependency errors, and stale-output prevention. | Graph safety and dependency source locations are release-critical acceptance work, not optional performance features. |
| ENG-004 | M5 requires a fresh Python process per call and documented JSON/process limits. | Provide and test batching examples first. A persistent worker needs measured workloads and a state/lifecycle specification before selection. |
| ENG-005 | Linux/Windows qualification and external learner observations are unavailable. | Add/retain reproducible qualification jobs and evidence intake; do not infer editor or platform needs from missing evidence. |

These rows cite implementation requirements and tests, not fabricated production incidents. Confirm the current candidate's test results before describing a mitigation as qualified.

## Current decisions

| Candidate | Decision | Reason / smallest current action | Revisit trigger |
| --- | --- | --- | --- |
| Shared lexical diagnostics and same-file navigation | Maintain completed M3 behavior | Existing engineering acceptance; preserve parity across compiler, CLI, LSP, and editor adapters. | Reproducible regression or actual navigation task failure. |
| Module failure locations and safe graph publication | Required engineering work | Needed to prevent wrong/stale execution and explain dependency failures. | A failing graph/containment/source-map acceptance case. |
| Clear bridge errors and batching guidance | Required engineering work | Directly supports documented process/JSON limits; does not require changing bridge architecture. | Reproduced bridge failure or repeated inefficient tutorial pattern. |
| Formatter | Deferred | Formatting rules and preservation semantics are not yet specified; no external task evidence exists. | Repeated formatting confusion or a measured maintenance need with a minimal formatting contract. |
| Parser recovery beyond one syntax error | Deferred | All independent semantic errors are already collected; syntax recovery adds grammar and editor complexity. | Observed syntax-repair bottleneck or a scoped recovery design with tests. |
| References/rename, signature help, imported-library completion | Deferred | Same-file definitions already exist; broader tools need workspace/import semantics and reliable edit safety. | Actual repeated lookup/rename task failures after module usage is observed. |
| Persistent/async Python worker | Implemented experimentally in alpha.4 after owner request | Explicit opt-in clients define state, cancellation, queue bounds, interpreter selection, and draining; direct calls stay synchronous. | Reproducible lifecycle, throughput, or cancellation failure; real workload/learner evidence. |
| Incremental module cache | Deferred | Correct deterministic full builds take priority; no measured unacceptable build latency is recorded. | Representative timing data with a correctness-preserving invalidation design. |
| Source-level debugger | Deferred | Source maps give runtime traces; stepping requires a separate launch/breakpoint/tooling contract. | Observed diagnosis tasks cannot be solved by mapped errors and smaller diagnostics improvements. |
| Unicode identifiers / bidi editor support | Deferred | Requires lexer, normalization, ranges, security/display, fonts, and editor review; translated docs are a distinct project. | A separately approved proposal with fluent/script-expert review and conformance cases. |

## Required decision template

Before selecting an additional pre-1.0 investment, fill in:

```text
Decision ID / candidate version / date:
Evidence IDs or reproducible engineering risk:
Observed problem and task:
Affected participant count / denominator (or “engineering evidence only”):
Severity and frequency:
Smallest change that resolves it:
Why existing behavior/documentation is insufficient:
Specification/API impact:
Compatibility and migration risk:
Implementation and ongoing maintenance cost:
Observable acceptance test:
Owner / priority / deferred alternatives:
Decision and evidence needed to revisit it:
```

A selected item needs its own acceptance criteria and compatibility assessment. A backlog list is not a selection decision. Do not add every proposed feature to 1.0; choose the smallest verified set needed for dependable use. M8's final review remains pending until M7 supplies actual findings or an explicit release-critical risk selects further work.

## Selected engineering mitigations — 9 November 2026

These selections use reproduced release-critical engineering risks, not participant observations. Affected learner counts remain unknown. They preserve the roadmap's small language/tooling surface; broader UX investments still await real sessions.

| Decision | Reproducer / evidence | Smallest implemented remedy | Compatibility / maintenance | Acceptance |
| --- | --- | --- | --- | --- |
| ENG-DEC-001: safe graph publication | Review found that claiming every `.mjs.map` as generated could delete an unrelated map; a FIFO could block output inspection. | Require paired generated modules, validate the ownership manifest, reject special files/symlinks, and stage/swap with rollback and guaranteed queue release. | New graph output is exclusively owned storage; legacy generated pairs migrate. Rejecting unrelated data preserves it. Standard filesystem helpers and bounded module limits keep the design small. | `tests/project.test.ts` orphan-map, FIFO, map-symlink, cancelled-publication, stale-graph and containment cases; complete suite passes. |
| ENG-DEC-002: explicit import errors | A missing namespace constructor export was not included in member metadata. | Record the first qualified constructor member alongside ordinary namespace properties and validate against parsed exports. | Applies only to new Arya namespace imports; JavaScript/dynamic property behavior stays native. No separate parser or project-code execution. | Direct property/constructor missing-export and shadowed-alias regression in `tests/project.test.ts`. |
| ENG-DEC-003: exact failed-log budget | A Unicode stderr regression reproduced 131072 forwarded bytes under a documented 65536-byte limit. | Truncate encoded bytes through a private imported Buffer helper, retaining the output-limit error code. | Ordinary successful logging unchanged; failed oversized logs remain intentionally truncated. The private helper avoids introducing a shadowable host dependency. | Unicode byte-budget and user-Buffer-shadowing regression in `tests/interop.test.ts`; passes Node 22.15/24. |

The original mitigation acceptance suite contained 80 passing language tests on both locally tested Node versions, plus separate IDE/desktop qualification. This verifies these engineering mitigations, not user adoption or final 1.0 readiness. M8's external evidence review remains open alongside M7.
