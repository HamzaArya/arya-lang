> Historical implementation guide. The original is preserved in [compat/node/docs/tooling-evidence.md](../compat/node/docs/tooling-evidence.md). Current native behavior is defined by the [native profile](native-profile.md), [SDK guide](native-sdk.md) and [qualification report](native-independence-report.md).

# Tooling selection record

**Status, 9 November 2026:** no external learner feedback has been collected, as confirmed by the owner. M8's selection process is prepared. This record does not turn an engineering preference into a user finding or declare M8's evidence gate complete.

M3 already introduced same-file lexical go-to-definition, multiple semantic diagnostics, and preservation of completion/Outline data when semantic errors exist. Those implemented features belong to M3's evidence and acceptance; do not count them as a external-user finding.

M1–M9 refer to the [archived milestone roadmap](history/roadmap-through-1.3.0-alpha.3.md). Use the [current roadmap](arya-roadmap.md) for active scope and the [readiness record](release-readiness.md) for candidate results.

## Current implementation status

The table below is generated from [feature status](feature-status.json). Published
behavior refers to the recorded alpha.9 baseline. Unreleased behavior belongs to
the alpha.10 source candidate and requires fresh qualification. Engineering tests
and the owner's requests justify this work; external learner findings are still
pending. Managed async Python, UI/motion and editor setup shipped in alpha.4.

<!-- feature-status:start -->
| Feature | Availability | Scope |
| --- | --- | --- |
| [Formatter](business-applications.md) | Published since 1.3.0-alpha.7 | Indentation and outer whitespace; preserves tokens and comments. |
| [Parser recovery](business-applications.md) | Published since 1.3.0-alpha.7 | Up to 20 errors at top-level line boundaries. |
| [Optional types](business-applications.md) | Published since 1.3.0-alpha.7 | Bounded checking, Arya module contracts and declaration output. |
| [Editor references, rename and signatures](business-applications.md) | Published since 1.3.0-alpha.7 | Snapshot/open-document analysis; incomplete public renames are refused. |
| [Incremental project builds](business-applications.md) | Published since 1.3.0-alpha.7 | Contained graph builds with bounded compilation reuse. |
| [Closed-file workspace analysis](editor-and-compiler-improvements.md) | Unreleased source | Discovery, cached dependency analysis and static namespace rename. |
| [Mutation and control-flow checking](editor-and-compiler-improvements.md) | Unreleased source | Declared versus flow types, branch joins, loop writes and conservative capture invalidation. |
| [npm declaration imports](editor-and-compiler-improvements.md) | Unreleased source | Bounded named/default/CommonJS exports and non-generic overloads. |
| [Standard testing library](testing-library.md) | Unreleased source | Node-backed suites, hooks, assertions and mocks. |
| [Standard security library](security-library.md) | Unreleased source | Password hashing, tokens, HMAC and authenticated encryption. |
| [Node editor debugging](syntax-and-debugging.md) | Unreleased source | Arya source breakpoints, local inspection and stepping; requires a Node adapter and per-editor/platform qualification. |
| [Exact accounting batches](accounting-engine.md) | Unreleased source | Bounded invoice/ledger library with portable BigInt, optional native kernel and exact strings; no ISO currency registry or standalone compiler. |
| [Native scalar executable preview](native-preview.md) | Unreleased source | Shared frontend, verified typed IR and host LLVM executable for annotated scalar functions; broader language/runtime and platform qualification remain incomplete. |
| [Persistent Python worker](python-async.md) | Planned / unqualified | Current calls and batches use fresh child processes. |
| [Unicode identifiers and bidi editing](arya-roadmap.md) | Planned / unqualified | Needs a separately reviewed language/editor proposal. |
<!-- feature-status:end -->

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
| ENG-005 | At the original review, Linux/Windows qualification and external observations were unavailable. Published alpha.9 now has its own platform evidence; changed source and learner sessions still need separate evidence. | Retain qualification jobs and evidence intake for the exact new revision. |

These rows cite implementation requirements and tests, not fabricated production incidents. Confirm the current candidate's test results before describing a mitigation as qualified.

## Current decisions

Maintain shared diagnostics, mapped module failures, contained graph publication
and explicit bridge errors. Formatter, bounded recovery, snapshot navigation and
incremental builds are implemented; their earlier deferral is superseded by the
published alpha.7–alpha.9 work. Closed-file workspace analysis and broader typed
boundaries are unreleased additions, not new external-user observations.

Before expanding the declaration reader, add a representative package regression.
The alpha.10 changes exercise pinned `escape-string-regexp` (ESM default export)
and `fast-deep-equal` (ambient CommonJS export) without executing package code
during analysis. Generic declarations still require an explicit trusted boundary.
Mutation and branch regressions are in [flow checks](../tests/type-flow.test.ts);
package contracts and overloads are in [declaration checks](../tests/declarations.test.ts).

Persistent Python workers, Unicode identifiers and richer interactive debugging
remain proposals or qualification work as shown above. Revisit them using a
reproduced problem or learner observation with the acceptance criteria below.

## Required decision template

Before selecting an additional language/tooling investment, fill in:

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
