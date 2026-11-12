# Arya native performance and product development plan

Planning date: 12 November 2026. Baseline: native Arya 2.0.0-alpha.2 on macOS ARM64. Implementation tasks below are planned unless explicitly identified as existing evidence.

Arya should become a readable native language for command-line tools, data processing, and exact financial calculations, with fast startup and simple deployment. The next development cycle should remove the measured runtime overhead, then build a useful native finance and data workflow on that foundation.

The first product milestone is a native command-line application that imports bounded invoice or journal data, validates it, performs exact calculations, and produces deterministic reports. It must run without Node or Python. Building an application may still require the documented C toolchain and native SDK.

This plan develops the independent compiler described in the [native guide](native-independence.md). It supplements the [implementation roadmap](implementation-roadmap.md), [target architecture](architecture-target.md), and [master requirements](arya-master-plan.md). It does not turn earlier preview results into evidence for the current compiler.

The subsequent [function-call implementation](native-function-calls.md) adds
capture-aware frame storage, direct calls, recursive numeric specialization and
qualification commands. The original measurements and planning targets below
remain the pre-optimization baseline.

## Product scope and priorities

The proposed product promise is **readable native programs with efficient data processing, explicit financial precision, and straightforward deployment**. It should be demonstrated through complete programs and reproducible measurements.

| Priority | Deliverable | Value to a developer |
| --- | --- | --- |
| First | Efficient functions, locals, records, lists, strings, and JSON | Ordinary application code benefits from native compilation |
| First | Native SDK, accurate diagnostics, consistent commands, runnable examples | A developer can install Arya and finish a useful task |
| First | Exact decimal and currency-aware Money libraries with documented policies | Financial calculations have explicit precision, currency, and rounding behavior |
| First | Streaming invoice and journal reporting example | Demonstrates the compiler, libraries, and deployment together |
| Following | Qualified native async services and database adapters | Extends the same foundation into business backends |
| Following | Versioned native ABI and official host bindings | Existing applications can adopt an Arya component incrementally |
| Later | Broader GUI, scientific, AI, package-registry, and Wasm work | Expands reach after the core workflow is dependable |

Keep the retained Node implementation available for applications that need its existing integrations. Retiring it depends on verified application and tooling replacements, rather than a performance milestone alone.

## Existing evidence and current gaps

The [native independence report](native-independence-report.md) records qualification of the earlier 2.0.0-alpha.1 snapshot. The compiler used for the measurements below identifies itself as 2.0.0-alpha.2. Its benchmark results are separate evidence; they do not requalify every feature or platform.

Some source implementations have advanced beyond older port-table and roadmap entries. Phase 0 must reconcile source, tests, supported behavior, and versioned status before changing availability claims.

| Area | Current evidence | Work required |
| --- | --- | --- |
| Independence | Self-hosted compiler, C11 backend, native runtime, bootstrap convergence, relocated SDK evidence | Repeat qualification for each new source snapshot |
| Numeric execution | Simple arithmetic functions receive a specialized native path | Extend optimization to calls, recursion, control flow, and common data representations |
| General execution | Managed dynamic values, lexical environments, generic calls, records, lists, and closures | Reduce allocation, lookup, dispatch, and collector overhead |
| Decimal calculations | Native libmpdec integration and independent reference cases | Build Money and financial policies above explicit exact values |
| Libraries | Partial native ports and retained Node integrations | Verify current ports; publish a precise support matrix |
| Platforms | Earlier exact-revision execution evidence on macOS ARM64 | Qualify Linux and other targets through actual builds and execution |
| Product adoption | CLI, documentation, editor work, SDK and examples exist in different execution profiles | Make the native installation and first useful workflow consistent |

### Execution baseline

The [raw benchmark report](benchmarks/2.0.0-alpha.2-vs-node-2026-11-12.json) compares the native compiler with Node v24.16.0 on an Apple M1 with 8 GiB RAM. Each computation result is the median of nine alternating fresh-process samples, with CPU warmup and checked outputs. Calls alternate between input sizes n and n+1; Fibonacci therefore covers both 24 and 25.

| Workload | Arya CPU milliseconds | Node CPU milliseconds | Interpretation for planning |
| --- | ---: | ---: | --- |
| Ten million numeric sum iterations | 12.750 | 11.441 | Similar scale; preserve this efficient path |
| Two million multiply/add/modulo steps | 15.470 | 108.745 | Strong result for this numeric kernel |
| Recursive Fibonacci | 62.410 | 0.811 | Function and environment overhead is a priority |
| Build and scan twenty thousand records | 40.904 | 0.160 | Allocation, method dispatch, and property access need work |
| One thousand JSON roundtrips | 5.930 | 0.734 | Improve representation and serializer/parser paths |
| One thousand string-processing operations | 6.948 | 0.474 | Reduce temporary values and copying |

Median wall time to launch, print one value, and exit was 3.267 ms for a compiled Arya program and 65.871 ms for Node across fifteen measured launches after warm launches. Startup, warmed CPU time, and warmed wall time are different measurements and must stay separate.

The host was busy and samples varied substantially. These values establish investigation priorities, rather than reliable cross-machine speed ratios or release performance budgets. Establish a quieter repeatable reference before enforcing numerical regression limits.

### Allocation diagnosis

The [allocation report](benchmarks/2.0.0-alpha.2-allocation-diagnostics-2026-11-12.json) records counters in private copies of the saved generated C. Each process evaluates work(n) and work(n+1) once without benchmark warmup. Counts include setup, output, and final collection.

| Process workload | Heap objects | Environment objects | Function objects | Calls through calloc wrapper | GC collections |
| --- | ---: | ---: | ---: | ---: | ---: |
| Numeric sum twice | 21 | 2 | 9 | 41 | 1 |
| Fibonacci 24 and 25 | 589,276 | 589,256 | 10 | 1,374,968 | 63 |
| Record workload at 20,000 and 20,001 | 386,702 | 93,340 | 40,010 | 680,067 | 9 |

These counts show substantial avoidable work. They do not attribute a percentage of execution time to each operation. Cumulative allocation requests are not peak memory or resident memory. Instrumented timings must not be mixed into the uninstrumented performance baseline.

## Engineering rules

1. Preserve supported syntax, evaluation order, exceptions, module live bindings, mutable captures, and observable behavior while optimizing execution.
2. Preserve binary64 number behavior, including NaN, infinities, signed zero, and remainder semantics. Keep exact financial values distinct from ordinary numbers.
3. Use heap storage when values escape their call or survive suspension. Stack allocation requires proven lifetime and collector-root safety.
4. Keep source diagnostics and useful stack traces in optimized builds. Treat call depth and error behavior as part of the supported contract.
5. Keep the independent frontend and new compiler passes implementable in Arya. Existing TypeScript IR work is reference material, not a new Node dependency for native compilation.
6. Keep unsupported features explicit. A native execution path must not silently start Node or Python.
7. Keep every optimization small enough to review against a specific semantic test and measured workload.
8. Retain source identities, toolchain versions, raw samples, failures, and skipped checks with milestone evidence.

## Architecture direction

The target flow is native parsing and resolution, capture and escape analysis, type and effect analysis, a verified native intermediate representation, optimization, and C11 emission. Evaluate an additional machine-code backend after common programs lower efficiently through this pipeline.

The native intermediate representation should make blocks, value types, lexical identities, direct and dynamic calls, conversions, exceptional exits, allocation, and GC roots explicit. Define its version, deterministic inspection format, and verifier before depending on it for optimizations. Decide the initial control-flow and value representation in a focused design record; do not require a complete optimizer framework before the first useful pass runs.

Keep the C backend as the execution path during early work. Improving the backend alone would leave generic environment allocation and dynamic dispatch in generated programs. Once the same verified IR can drive both backends, compare compilation time, executable size, runtime, diagnostics, and distribution costs before selecting another default.

## Milestone sequence and effort assumptions

These are initial engineering effort ranges for an experienced full-time compiler/runtime engineer, not delivery commitments. Re-estimate after Phase 0 and after the first stack-local implementation. Platform-specific failures and additional compatibility requirements can expand them.

| Phase | Main result | Dependencies | Initial effort range |
| --- | --- | --- | --- |
| 0 | Reproducible baseline and accurate feature status | Existing source and benchmark artifacts | 1 to 2 engineer-weeks |
| 1 | Efficient locals, scopes, and known function calls | Phase 0 | 2 to 4 engineer-weeks |
| 2 | Efficient records, lists, and method calls | Phase 1 lifetime and root model | 2 to 4 engineer-weeks |
| 3 | Verified native IR and broader specialization | Phase 1 analyses; Phase 2 representation contracts | 3 to 5 engineer-weeks |
| 4 | Efficient strings, JSON, and bounded streaming data | Phases 2 and 3 | 2 to 3 engineer-weeks |
| 5 | Exact Money libraries and useful finance CLI | Phase 3 types and Phase 4 data path | 3 to 5 engineer-weeks |
| 6 | Native developer and distribution workflow | Verified compiler and library surface from Phases 1 to 5 | 3 to 5 engineer-weeks |
| 7 | Integrated release qualification and public evidence | Phases 0 to 6 | 2 to 4 engineer-weeks |

The sequential planning total is 18 to 32 engineer-weeks for this defined milestone, excluding a full Windows port, a native service/database ecosystem, and later expansion. Documentation, tests, and benchmark work happen throughout each phase. Design work may overlap, but dependent representation changes should land in sequence.

### Phase 0 Establish the reference

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P0-01 | Freeze the current source snapshot, build flags, SDK, benchmark harness, and input generators | A source bundle or revision plus complete patch reproduces the recorded compiler; a commit hash alone is insufficient for a dirty checkout |
| P0-02 | Reconcile native version, manifest, runtime ports, tests, and roadmap status | Every advertised function has an exact supported scope and executable acceptance case |
| P0-03 | Add reusable allocation and runtime counters behind a diagnostic build option | Counts for allocations, bytes, environments, methods, lookups, GC cycles, and GC time; diagnostics disabled in timing builds |
| P0-04 | Extend the benchmark protocol | CPU and monotonic wall timing where available; sufficient batch duration; stable warmup; recorded runtime options, environment, load, input sizes, and sample order |
| P0-05 | Add application-shaped baselines | Streaming import, aggregation by account, exact invoice batches, and CLI reporting; separate parsing, preparation, kernel, serialization, and end-to-end cost |
| P0-06 | Establish a quiet reference runner and baseline budgets | Repeated sessions expose uncertainty; dedicated reference measurements are separated from ordinary developer-machine results |

Use the existing [benchmark harness](../scripts/benchmark-native.mjs) as the starting point. Add measured peak RSS, executable size, application build time, compiler bootstrap time, and incremental build time. Define platform measurement tools and units so their results are comparable. Measure startup with filesystem-cache state described; the existing warm-launch result is not a cold-disk result.

Compare equivalent algorithms, inputs, precision, bounds, and output policies. Compare binary64 calculations with binary64 calculations. Compare exact financial workloads with equivalent Node BigInt or decimal implementations. Include their preparation and conversion costs in end-to-end results.

Begin application data sets at 1,000, 10,000, and 100,000 rows. Add one-million-row streaming cases after bounds and resource use are verified. Use seeded synthetic fixtures, explicit maximum record and batch sizes, and bounded failure cases. Large workloads must respect the native libraries' documented limits.

Exit when another clean checkout can reproduce correctness and broadly consistent measurements, allocation diagnosis is repeatable, and current availability claims match tested behavior.

### Phase 1 Remove overhead from functions and locals

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P1-01 | Classify local variables, captures, mutation, escaping values, and suspended frames | Analysis cases cover mutable and immutable captures, shared cells, loop captures, default parameters, and module live bindings |
| P1-02 | Emit ordinary locals and temporaries into native frame storage | Eligible scalar functions allocate no temporary heap buffer or environment per call after setup |
| P1-03 | Eliminate environments for scopes that need no escaping storage | Eligible empty loop and branch scopes allocate no environment per iteration |
| P1-04 | Add direct calls for statically proven targets, including recursion | No generic callable dispatch on eligible calls; dynamic and reassignable targets preserve behavior |
| P1-05 | Extend the numeric path across eligible function calls | The Fibonacci workload uses efficient call frames and numeric values while preserving numeric and error semantics |
| P1-06 | Validate root lifetimes, error exits, tracing, and call-depth behavior | GC stress, sanitizer, differential, closure, and exception tests pass in debug and release |

Direct calls require proof about the binding and calling convention. Mutable function variables, live imported values, optional calls, defaults, rest parameters, and side-effecting arguments need correct lowering or a generic path. An optimization must not skip argument evaluation or suppress a required error.

Keep true captures in shared managed cells when necessary. Values that survive async suspension require storage with the appropriate lifetime. Do not assume that every source-level local can use the C stack.

Exit with generated-code evidence for allocation-free eligible calls and scopes. The initial allocation objective is at least a 95 percent reduction in calloc-wrapper calls for the identical two-evaluation Fibonacci process. This is a proposed engineering target, not an achieved result or a substitute for correctness. Report execution and memory changes independently.

### Phase 2 Improve records lists and methods

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P2-01 | Reuse immutable literal strings and field keys with defined GC lifetime | Repeated access to a literal property name does not allocate a new string each time |
| P2-02 | Add record layouts and fast field slots for proven layouts | Common field reads avoid repeated linear name search; dynamic additions and changes have a correct fallback |
| P2-03 | Lower immediate builtin method calls directly | Eligible rows.push(value) calls create no bound method object; detached method values retain existing behavior |
| P2-04 | Add efficient dense-list load, store, append, and iteration operations | Preserve bounds, holes or their documented rejection, readonly behavior, mutation, and evaluation order |
| P2-05 | Reduce allocation overhead for remaining small managed objects | Allocation and GC profiles justify any pool or arena; lifetimes and failure cleanup are tested |
| P2-06 | Run record and collection qualification | Record order, JSON key order, aliasing, mutation, cycles, closures, and runtime errors match the supported contract |

Start with efficient generic dense storage and known record layouts. Add specialized numeric-list storage only when type analysis and representation transitions are explicit. Keep native string, record, and array semantics visible to the collector.

Exit when immediate push calls and repeated literal-key reads stop creating wrappers and key strings. The initial objective is at least an 80 percent reduction in total managed-object allocation for the same two record-workload evaluations. Record objects themselves remain legitimate allocations; reducing them further requires escape analysis rather than unsafe reuse.

### Phase 3 Build the verified native optimization pipeline

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P3-01 | Define the native IR, verifier, serialization, and source mapping | Invalid types, control flow, calls, effects, root lifetimes, and conversions are rejected before emission |
| P3-02 | Implement native type and effect propagation | Specialization remains conservative around mutation, unknown calls, captured values, and aliases |
| P3-03 | Lower the Phase 1 and Phase 2 operations through IR | The compiler executes real fixtures through the new path; unused IR structures do not satisfy this task |
| P3-04 | Add constant propagation, dead-value removal, direct calls, and selective inlining | Supported semantics and diagnostic behavior survive every pass; code-size and compile-time changes are recorded |
| P3-05 | Add typed record and numeric-list specialization | Representation changes are checked; mixed or unknown values use a correct generic path |
| P3-06 | Rebuild the self-hosted compiler and evaluate backend choices | Bootstrap convergence and compiler tests pass; backend comparisons use the same verified IR and semantics |

Reuse semantic contracts and test cases from the [existing scalar IR](../src/native-ir.ts), [lowering](../src/native-lower.ts), and [backend](../src/native-backend.ts) where appropriate. Implement native compiler components in the independent toolchain. Splitting compiler sources into new modules also requires updates to the Makefile, bootstrap source staging, SDK packaging, and clean-build tests.

Prioritize optimizations that remove known runtime work. Defer speculative JIT compilation, profile-guided optimization, and broad vectorization until profiles show a need. If an LLVM or other backend is evaluated, retain the C path for differential checking until the replacement meets the same gates.

Exit with a verified, inspectable IR used by executed programs, broader specialization than the current numeric-only path, and self-hosting evidence for the resulting compiler.

### Phase 4 Improve strings JSON and streaming data

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P4-01 | Reduce temporary buffers and redundant copies in common string operations | Allocation and copy counts improve for trim, case conversion, split, join, and concatenation without Unicode regressions |
| P4-02 | Add fast JSON paths for supported plain data and known record layouts | Escaping, numeric formatting, key ordering, malformed input, and existing unsupported-option diagnostics remain correct |
| P4-03 | Add bounded streaming text and CSV import primitives | Correct handling of quoted fields, embedded newlines, encoding policy, record limits, cancellation or interruption, and malformed data |
| P4-04 | Add chunked processing and incremental report output | Input size does not force retention of all rows; memory follows chunk size plus explicitly retained aggregation state |
| P4-05 | Add end-to-end data benchmarks | Parsing, allocation, calculation, output, and peak RSS are measured together and separately |

Preserve UTF-16 observable behavior where required by the language contract. ASCII specialization must have a Unicode-correct path. Reusing string slices or buffers requires a defined ownership and lifetime policy.

V8's [JSON optimization account](https://v8.dev/blog/json-stringify) is a useful reference for specialized plain-data paths, string scanning, and buffer management. It is an implementation reference, not evidence of an Arya speedup.

Exit with a native streaming import and aggregation program, deterministic checked output, bounded memory, and recorded improvements over the new Phase 0 application baseline.

### Phase 5 Deliver exact financial libraries and the first application

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P5-01 | Define immutable Money values, decimal boundaries, currency metadata, and versioned serialization | Currency mismatch is rejected; rounding, scale, conversion, zero, overflow, and error behavior are documented and executable |
| P5-02 | Reuse or port exact invoice and ledger calculation policies | Native and equivalent reference implementations agree on signed amounts, all supported rounding modes, limits, and per-line versus aggregate rounding |
| P5-03 | Add journal validation and account aggregation libraries | Balanced journal, invalid-line, duplicate-input policy, deterministic order, and bounded account-count cases pass |
| P5-04 | Build a complete native finance reporting CLI | A new user can import a synthetic data set, see useful row diagnostics, calculate exact results, and export a deterministic report |
| P5-05 | Benchmark exact application workloads and qualify library APIs | Equivalent precision and policy across comparators; preparation, conversion, kernel, and end-to-end timings remain separate |

Use the native decimal implementation and [accounting policy](accounting-engine.md) as inputs, while respecting their different limits and execution profiles. The existing three-letter currency tag is not an ISO currency registry. A registry requires a pinned data source, update policy, provenance, and tests before the library advertises that capability.

Expose Money through an additive library API first. New syntax or public type semantics require a separate language design decision. Ordinary number arithmetic must not silently become decimal or scaled-integer arithmetic.

The first application performs validation and reporting; database posting, authorization, legal accounting suitability, payroll, and banking workflows are separate product scopes. Journal totals alone are not a transactional ledger system.

Exit with reproducible reference vectors, documented bounds, a packaged example, and a complete install-to-report walkthrough. Select final performance budgets for exact workloads after their equivalent Phase 0 baselines exist.

### Phase 6 Make the native workflow dependable

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P6-01 | Align native CLI behavior and developer documentation | Check, build, run, diagnostics, argument passing, release/debug modes, SDK discovery, and error exits match documented behavior |
| P6-02 | Package and relocate the compiler and SDK | A clean machine builds an application with the documented C toolchain; the application runs without Node, Python, repository files, or compiler tools |
| P6-03 | Connect editor behavior to the actual native support matrix | Completions and diagnostics identify the selected execution profile and do not promise unsupported native APIs |
| P6-04 | Qualify macOS ARM64 and introduce executed Linux targets | Each supported OS and architecture has its own fresh-source, execution, sanitizer, and SDK evidence |
| P6-05 | Define native build caching and incremental invalidation | Changes to compiler, flags, imports, target, runtime, or decimal library invalidate the correct artifacts |
| P6-06 | Complete onboarding and troubleshooting examples | A fresh user can install, build, debug a controlled failure, and complete the finance CLI walkthrough |

State compiler, SDK, linker, and runtime dependencies separately. Package checks must cover licenses, checksums, clean installs, relocation, missing dependencies, and update behavior. Release work follows the existing [release process](releasing.md).

Prioritize macOS ARM64 and Linux x64, then qualify Linux ARM64 and macOS x64 as execution environments become available. Windows requires a dedicated portability assessment of process, filesystem, build, and async primitives; it must not be claimed supported merely because C output exists. Wasm remains a separate follow-on target.

Exit with a native support matrix backed by executed artifacts and a first-use workflow that does not depend on undocumented development-machine state.

### Phase 7 Qualify the integrated milestone

| Task | Work | Acceptance evidence |
| --- | --- | --- |
| P7-01 | Run the complete correctness and compatibility matrix | Native tests, GC stress, sanitizers, differential cases, decimal reference, bootstrap convergence, SDK relocation, and retained Node regression checks pass within their recorded scopes |
| P7-02 | Repeat all microbenchmarks and application benchmarks | Raw samples, source identities, flags, inputs, machine state, memory, code size, and compile times are retained |
| P7-03 | Review performance and resource budgets | Significant regressions are explained, fixed, or reflected in an explicit supported-scope decision |
| P7-04 | Update status, guides, examples, and milestone evidence | Published claims agree with the exact qualified snapshot and tested platforms |
| P7-05 | Prepare versioned candidate artifacts and a migration guide | Fresh installation and the documented upgrade path succeed; immutable prior artifacts remain verifiable |

Exit with a useful native finance/data workflow, demonstrated reductions in runtime overhead, a reproducible release candidate, and a clearly bounded compatibility contract. Publication and stable support commitments remain separate release decisions.

## Performance objectives and measurement policy

The following are proposed objectives to evaluate after Phase 0 establishes a repeatable reference. Structural correctness gates are mandatory. Speed targets describe desired outcomes and do not imply that the current compiler meets them.

| Area | Proposed objective | How to evaluate it |
| --- | --- | --- |
| Eligible numeric functions | No per-call environment or temporary-buffer heap allocation | Generated-code inspection and diagnostic counters |
| Eligible empty scopes | No per-iteration heap environment | Loop stress cases and allocation counters |
| Immediate builtin method calls | No transient function wrapper | Method-call counters and detached-method correctness cases |
| Fibonacci process | At least 95 percent fewer calloc-wrapper calls than the recorded diagnostic baseline | Identical inputs and counter definitions; elapsed time measured separately |
| Record process | At least 80 percent fewer managed-object allocations than the recorded baseline | Identical data and observable output |
| Ordinary dynamic workloads | Initial checkpoint of at least 5 times faster recursion and 4 times faster record processing than a repeatable pre-change Arya baseline | Uninstrumented paired measurements with uncertainty and memory results |
| Longer-term competitiveness | Work toward within 3 times Node's warmed time on representative dynamic workloads, while retaining numeric strengths | A goal for prioritization, rather than a universal support or release guarantee |
| Financial/data application | Correct equivalent output, bounded memory, and a measured end-to-end advantage on at least one declared target workload | Equivalent Node exact arithmetic, same data and policies, complete costs |
| Existing efficient paths | Investigate any repeatable slowdown above 10 percent | Confirm on the reference runner; distinguish noise from a real regression |
| Startup, size, and build time | Preserve the useful native deployment advantage and record tradeoffs | Separate startup, executable plus dependencies, application build, incremental build, and bootstrap measurements |

Report medians and spread, paired ordering, and repeated sessions. Use confidence intervals where the sample design supports them. Small differences on a busy machine must not drive architectural decisions. Ordinary shared CI should enforce correctness and structural allocation rules; numerical performance enforcement requires a sufficiently stable runner.

Never summarize language performance with one unqualified average or a blanket claim that Arya beats Node. A result must identify the workload, precision, size, platform, runtime versions, and measurement boundary.

## Correctness and resource qualification

| Surface | Required cases |
| --- | --- |
| Calls and locals | Direct and dynamic calls, recursion, defaults/rest, argument side effects, mutable bindings, TDZ, return paths, stack depth, and source traces |
| Closures and scopes | Escaping captures, shared mutation, loop captures, nested closures, early exits, and module live exports |
| Numeric specialization | NaN, infinities, signed zero, binary64 boundaries, remainder, division, comparisons, and conversion behavior |
| Records and lists | Field addition and mutation, aliasing, iteration order, readonly values, mixed elements, bounds, cycles, and current sparse-list policy |
| Strings and JSON | Unicode, NUL, surrogate handling, escaping, numeric formatting, property order, malformed input, depth/size bounds, and unsupported features |
| Memory and errors | GC stress, rooted values across allocations, exceptional cleanup, cancellation/suspension where supported, sanitizer runs, and target-specific leak checks |
| Exact values | Independent decimal and integer references, signed rounding, scale limits, currency mismatch, overflow, deterministic serialization, and rejected input |
| Toolchain and packages | Clean native bootstrap, generation convergence, missing toolchains, failed publication cleanup, relocated SDK, target execution, and dependency inspection |

Keep tests focused on observable semantics and lifetime failures that optimizations could introduce. Counter checks supplement behavioral tests. Preserve generated failing programs and random seeds so differential or fuzz failures become reproducible regressions.

## Implementation boundaries

| Existing location | Planned responsibility |
| --- | --- |
| [Native compiler](../native/compiler/compiler.arya) | Capture and escape analysis, direct calls, local storage, specialization, then native IR lowering |
| [Runtime core](../native/runtime/core.c) | Value layouts, allocation, roots, environments, fields, method dispatch, and collector instrumentation |
| [String runtime](../native/runtime/text.c) | String representations, fast operations, Unicode-correct paths, and buffer ownership |
| [JSON runtime](../native/runtime/json.c) | Checked parse/stringify, record-layout paths, and bounded output buffers |
| [Native list helpers](../native/runtime/list.c) | Efficient collection operations with preserved callback and mutation behavior |
| [Native decimal runtime](../native/runtime/decimal.c) | Exact decimal contracts and checked boundaries used by future Money libraries |
| [Native tests](../native/tests/run.sh) | Execution, differential fixtures, GC stress, sanitizer, SDK, and failure-path qualification |
| [Native benchmark](../scripts/benchmark-native.mjs) | Reproducible uninstrumented comparisons and application workload expansion |
| [Build rules](../Makefile) and [bootstrap](../native/bootstrap/verify-clean.sh) | New compiler-module staging, independent build, and compiler generation checks |
| [Native manifest](../native/manifest.json) and [feature status](feature-status.json) | Accurate distinction between implemented source, tested native behavior, retained Node behavior, and planned work |

New native IR modules, data libraries, profiling tools, and financial fixtures should be introduced through focused changes with explicit names and ownership. Existing TypeScript tooling remains a compatibility and reference surface until its native replacement is qualified.

## Main risks and responses

| Risk | Response |
| --- | --- |
| Stack allocation breaks captures, errors, or suspension | Conservative escape analysis, explicit root lifetimes, generic fallback, and stress/sanitizer coverage before default enablement |
| Direct calls ignore mutation or live imports | Prove the target binding and effect constraints; use dynamic dispatch when they are unknown |
| Fast record/list layouts change semantics | Specify transitions, ordering, aliasing, and collector scanning; qualify mixed and dynamic cases |
| Specialization increases executable size or compiler time | Record size and build budgets; restrict inlining and specialization growth |
| Microbenchmark gains fail to improve applications | Maintain end-to-end import, finance, and reporting workloads throughout development |
| Backend migration consumes the schedule | Keep C emission while removing known overhead; compare alternative backends only through equivalent IR |
| Financial APIs imply guarantees they do not provide | State precision, policy, bounds, and validation scope beside the API; keep reporting separate from transactional posting |
| Source and documentation diverge | Update manifest, executable examples, and exact-snapshot evidence in each milestone |
| Broad platform work blocks a useful release | Qualify targets incrementally and describe the tested matrix precisely |
| Ecosystem scope overwhelms compiler work | Finish the native CLI/data milestone before expanding into services, UI, AI, and a new registry |

## Follow on development after the first milestone

Native business services require their own dependency sequence: qualify async scheduling, cancellation, finally/cleanup, filesystem completion, dates/zones, and resource lifetime; then implement HTTP and the required service libraries; then add a first database adapter with exact value mapping and transaction tests. SQLite is a proposed first adapter for local tools, followed by a separately scoped network database adapter.

A journal-posting application additionally needs transaction boundaries, idempotency, authorization integration, concurrent updates, migrations, rollback and ambiguous-outcome handling. Keep those requirements separate from calculation and reporting benchmarks.

Host adoption should begin with the existing explicit JSON-lines process boundary. Introduce a public C ABI after values, allocation ownership, handles, threads, errors, and versioning are specified and tested. Official Node/Python bindings should consume that ABI rather than expose private runtime layouts.

Windows, additional architectures, Wasm, GUI work, scientific arrays, AI integrations, and a registry need separate discovery estimates and execution gates. This plan does not include them in the 18 to 32 engineer-week core milestone.

## First implementation batch

Start with P0-01 through P0-03 and P1-01. Preserve the existing reports, make allocation diagnosis repeatable, freeze a reproducing source snapshot, and write the capture/root-lifetime design with executable cases.

Then implement stack locals for functions with no escaping captures, preserving the generic path for other functions. Add direct numeric calls and recursion next. Complete a self-hosted rebuild, semantic tests, allocation comparison, and the same benchmark suite before moving on to record-layout work.

Every completed batch should record its source snapshot, concrete behavior, tests, raw measurements, regressions, and remaining scope. Update this plan's task status from that evidence, rather than from source presence alone.
