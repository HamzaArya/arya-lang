# Arya 1.1.0 native compilation plan

**Status:** Native implementation and self-hosted compiler added in 1.1.0-alpha.1; platform/release qualification is tracked separately. See the [native guide](arya-native.md) and [contract](arya-native-specification.md).
**Requested target:** Arya language/compiler 1.1.0, independently of AryaCode.
**Date:** 9 November 2026.
**Backend decision:** User-selected C11 backend, 9 November 2026. Self-hosting was additionally requested and implemented through an Arya-written compiler and three-generation bootstrap check.
**Starting point:** The working repository identifies itself as 0.2.0-alpha.3. The existing [roadmap](arya-roadmap.md) and [stable-release gates](release-readiness.md) still apply.

## 1. Product goal

A developer can write a small Arya command-line application, compile it ahead of time, and give the resulting executable to someone who has no Arya installation, Node.js, JavaScript engine, or Python interpreter.

The first release examples are a calculator, a file-processing utility, and a multi-file application. A graphical calculator is later library work; native compilation alone does not supply windows or widgets.

“Native” means that Arya operations become compiled machine code, with an Arya runtime linked into the program. The selected direction is Arya to C11 to optimized machine code using a qualified C compiler. Packaging JavaScript with an embedded engine does not meet this goal. Normal operating-system libraries may remain dependencies; each artifact must disclose its actual dependencies.

**Performance priority:** Generate efficient machine code and measure its cost against equivalent optimized native programs. Native compilation alone does not guarantee maximum speed; representation, specialization, allocation, runtime calls, and algorithm choice must also be addressed.

This plan assumes an additive native execution profile. Existing JavaScript execution remains available and remains the default. Replacing the stable language's existing JavaScript semantics would require a separate compatibility decision and potentially a major release under the [compatibility policy](compatibility-policy.md).

## 2. Release scope

| Included in the proposed 1.1.0 native profile | Deferred beyond this release |
| --- | --- |
| Native command-line executables and a self-hosted Arya compiler | GUI toolkit, mobile apps, browser/Wasm target |
| Inferred types, specialized native operations, dynamic fallback, automatic memory management | User-visible static type syntax, ownership system, manual allocation syntax |
| Functions, recursion, closures, conditions, loops | Async/await, promises, threads, event loop |
| Strings, numbers, booleans, null/undefined, lists, plain records | JavaScript prototypes, proxies, getters/setters, BigInt, Symbol |
| Arya-to-Arya modules and explicit exports | npm imports, embedded JS engine, native Python bridge |
| Exceptions and source-located runtime errors | Interactive source debugging and optimized debugger parity |
| Console input/output, arguments, text files, basic math | Networking, arbitrary C ABI imports, general package manager |
| Qualified macOS arm64 and Linux x86_64 builds | Windows, other architectures, automatic cross-compilation |

Platform rows are proposed support goals, not current support claims. Start development on macOS arm64, then require Linux x86_64 evidence before calling the planned two-platform release complete. Windows needs its own ABI, toolchain, path, console, and packaging qualification milestone before being advertised.

## 3. Selected backend

Use the existing TypeScript implementation for the compiler initially. Introduce a source-located abstract syntax tree (AST), shared resolution, and a backend-neutral intermediate representation (IR). Keep the existing JavaScript backend and add a C11 emitter. Infer types and specialize operations before emitting C; use runtime helpers where values remain dynamic. Qualify Clang on macOS and GCC/Clang on Linux.

```text
.arya source graph
        |
 lexer -> AST -> name/module resolution -> execution-profile validation
        |
       IR
        +----> JavaScript emitter -> ES modules -> Node.js
        |
        +----> type inference / specialization -> C11 source
                                                    |
                                       optimizing C compiler
                                                    |
                                       object code + runtime -> linker
                                                    |
                                               executable
```

Preserve Arya's evaluation order, numeric semantics, string model, and checked operations during lowering. Generated C is compiled ahead of time; it is not interpreted at application runtime. The C compiler produces machine-code object files that a linker combines with the runtime into the final executable ([GCC output options](https://gcc.gnu.org/onlinedocs/gcc/Overall-Options.html)).

The C backend delegates instruction selection, register allocation, object generation, and platform ABI details to an established native compiler. Emit explicit temporaries so C's expression evaluation rules cannot change Arya's left-to-right evaluation or evaluate assignment receivers/indexes more than once. Native performance still depends on the code and runtime Arya generates. A direct LLVM backend is deferred and would need measured evidence of a limitation before reconsideration.

| Choice | Decision / proposal | Revisit when |
| --- | --- | --- |
| Machine-code backend | Selected: C11 output compiled to optimized machine code on arm64 and x86_64 | A measured C-backend limitation justifies a targeted backend change |
| Toolchain integration | Proposed: generate .c files and invoke a qualified Clang/GCC compiler and platform linker; record versions and flags | Build latency or platform requirements justify integration changes |
| Compiler implementation | Retain TypeScript and the Node-based development tools | Native executable delivery is stable and compiler bootstrapping has a measured benefit |
| Runtime implementation | Small C runtime with an explicit ABI, compiled and linked with generated program code | Benchmark or ABI evidence justifies a runtime implementation change |
| Value representation | Unboxed binary64/boolean values where proven; tagged values at genuinely dynamic boundaries; ordinary traceable heap pointers | Benchmarks justify additional layouts or specialized collections |
| Memory management | Implemented precise nonmoving mark/sweep collector with explicit generated roots and iterative marking; no collector dependency | Profiling or collection stress exposes a reason to replace it |

The initial BDWGC option was replaced during implementation by a precise, nonmoving mark/sweep collector. Generated activation roots and managed environments make object reachability explicit, including cyclic lists, records, and closures. Iterative marking avoids recursive collector stack growth; sanitizer and forced-collection tests validate roots and reclamation. This keeps the runtime dependency-free beyond platform libraries.

Developers initially need Node.js, the Arya compiler, a qualified C compiler and platform linker/SDK, and the selected runtime dependencies to **build**. People receiving the finished executable need only its documented runtime/OS dependencies to **run**; no C compiler is required there. The Arya-written compiler in bootstrap/compiler.arya is an additional native entry point and compiles its own source; the TypeScript compiler is retained for bootstrapping and JS tooling.

### Required performance work

- Infer primitive types through control flow and the module graph; specialize functions for proven argument types with a bounded specialization/code-size budget.
- Emit ordinary C double arithmetic for proven numeric operations, without per-operation boxing or dynamic dispatch. Qualify binary64 and floating-point behavior on each toolchain; do not silently replace Arya numbers with machine integers.
- Emit typed C locals and specialized functions where possible, expose suitable inlining opportunities, and eliminate allocations/checks only when proven unobservable. Box at explicit boundaries when dynamic values or captured mutable cells require it.
- Keep a semantics-preserving dynamic fallback for polymorphic calls. Native compilation must not reject otherwise supported code solely because inference is inconclusive.
- Define debug and release optimization settings, target CPU baselines, compiler warnings, and optimizer regression tests. Avoid undefined C behavior, unsafe casts, false aliasing assumptions, and fast-math transformations that change the language contract. Semantic proofs remain the Arya compiler's responsibility.
- Benchmark numeric loops and function calls without constant-foldable workloads, plus allocations, strings, and file processing. Compare equivalent work and results against optimized C and the JS target; record startup separately from steady-state throughput.
- Inspect generated C and optimized disassembly to verify numeric kernels use native arithmetic without generic runtime arithmetic calls. Set explicit per-workload speed/memory regression budgets after the first measured baseline. Do not claim universally optimal speed or C/Rust parity without evidence.

Type inference and specialization are internal optimizations in this release. Adding fixed-width integer types, ownership, or source-level type annotations requires a separate semantic proposal; the C backend does not implicitly add those language features.

## 4. Native semantic contract

Freeze a versioned native profile before implementing the complete backend. The [current specification](arya-specification.md) describes the Node profile; it must not silently become the specification for an incomplete JavaScript reimplementation.

| Area | Proposed native behavior and acceptance requirement |
| --- | --- |
| Scope and bindings | Preserve lexical shadowing, function hoisting, temporal dead zones, const checks, closures capturing mutable bindings, and fresh loop bindings. |
| Numbers | IEEE-754 binary64, including NaN, infinities, signed zero, remainder, and the existing unary/power precedence. No fast-math transformations that change the contract. |
| Conditions/equality | Preserve truthiness, operand-returning short-circuit operators, primitive strict equality, and identity equality for heap values in the shared subset. |
| Strings | Preserve UTF-16 length/index behavior and code-point iteration; encode console/files as UTF-8 with an explicit malformed-input and lone-surrogate policy. |
| Calls and closures | Preserve argument evaluation order, missing arguments as undefined, extra arguments, bare return, recursion, and mutable captured cells. |
| Lists and records | Managed heap identity, mutation, explicit bounds/property checks, and plain own-string-key data. Publish exactly which list/record operations are portable. |
| Coercion | Specify primitive conversions and numeric formatting with boundary fixtures. Host object conversion hooks and prototype behavior are excluded, rather than approximately emulated. |
| Exceptions | Preserve throwing/catching values. Use an explicit result/error return convention internally, including error propagation through calls and modules. Runtime faults become catchable native error records. |
| Modules | Reuse relative Arya imports, canonical containment, cycle rejection, deterministic initialization, and namespace live bindings. |
| Built-ins | Implement print, len, str, number, range, and args for documented native inputs. Keep range validation and limits; document complex-value print formatting separately. |
| Host APIs | Node globals, use js, use python, constructors for host classes, async and await are outside the native profile. Diagnose statically identifiable uses before invoking a C compiler or linker. |

The native profile is intentionally bounded. A program that depends on inherited JavaScript properties or arbitrary host values is not automatically portable because it uses otherwise familiar syntax. Profile documentation must enumerate differences and include migration examples. Dynamically discovered unsupported operations must fail with a stable native error; they must not fall back to JavaScript or invoke undefined behavior in generated code or runtime helpers.

Use tagged values for undefined and uninitialized bindings as distinct states. Represent captured mutable bindings as shared managed cells. Define allocation/root rules for all generated temporaries and module globals; do not hide heap pointers in representations the collector cannot trace. Release files and other OS resources deterministically rather than relying on GC finalization.

## 5. Proposed developer interface

These commands are a proposal; the current CLI does not implement these flags.

```sh
arya check calculator.arya --target native
arya build calculator.arya --target native -o build/calculator
./build/calculator 12 + 8

arya run calculator.arya --target native -- 12 + 8
arya build calculator.arya --target js
```

Unflagged check/build/run retain their existing Node-profile behavior and artifact locations. `--target` selects an execution profile; a future OS/CPU selector is a separate option, not an implicit promise of cross-compilation. Native output defaults to a separate `.arya/native` directory; `-o` overrides only the final executable destination. A failed build never runs or replaces a previous successful executable.

`check --target native` analyzes the entire import graph without executing source/imports, invoking a C compiler, or requiring a toolchain installation. Check and LSP diagnostics must agree about unsupported features. New diagnostic codes, native output paths, toolchain selection, optimization settings, and failure/exit statuses need a documented contract.

Keep existing `compile()` return fields and default behavior intact. Define a separate native emission API or an additive explicitly selected API rather than changing `.code` from JavaScript to C for existing callers.

For native standard-library access, propose contextual `use std "io" as io`, with io, fs, and math modules. These imports are new syntax, not existing functionality. Keep `std` usable as an ordinary identifier elsewhere. Specify input/EOF, filesystem errors, encoding, numeric parsing, and resource lifetime before freezing these APIs. Existing bare `Math`, `process`, and `JSON` globals do not become native APIs implicitly.

The first calculator can use the existing args and number built-ins; interactive stdin is a later step in this same release. Division-by-zero behavior follows the numeric contract; a calculator may explicitly present a friendlier message.

## 6. Implementation milestones

N0–N6 engineering work is implemented and qualified for the experimental alpha on the recorded native platforms. Checked items have implementation/test evidence. Stable 1.1 promotion still follows a qualified stable 1.0; publication of an alpha does not bypass that gate. See the [verified native release record](native-release-verification.md).

| ID | Deliverable | Depends on | Completion evidence |
| --- | --- | --- | --- |
| N0 | Freeze purpose, execution profiles, portable subset, and proposed native specification | Review of current language and eventual 1.0 contract | Approved semantic tables, supported/unsupported examples, CLI/API proposal, and compatibility assessment |
| N1 | Prove C code generation and runtime packaging | N0 draft | Compile emitted C for print(2 + 3) to object code, link runtime/collector, run without Node, and retain toolchain/dependency evidence on both proposed platforms |
| N2 | Introduce AST and shared resolution; preserve JS behavior | N0; N1 validates backend choice | Existing compiler/API, source-map, module, package, and editor suites pass; no source execution during analysis |
| N3 | Implement values, primitive type inference/unboxed operations, collections, allocation, and errors | N1, N2 | Runtime tests, generated C compilation checks, sanitizer checks, optimized-build GC stress, and shared-subset differential tests |
| N4 | Implement specialized functions, closures, control flow, and module graphs | N3 | Hoisting/TDZ, mutation, recursion, closure cycles, loop capture, exceptions, live exports, initialization order, and boxed/unboxed boundary tests |
| N5 | Add native check/build/run and standard library | N4 | Calculator, text utility, and multi-file examples work from an installed compiler with targeted diagnostics and reliable process exits |
| N6 | Add optimization/performance qualification, source diagnostics, and build reliability | N5 | Numeric-kernel generated-C/disassembly checks and native/JS/C benchmarks; original .arya errors; clean-host runs on both targets |
| N7 | Qualify native 1.1.0 and publish reviewed artifacts through the existing release process | N0–N6 and stable 1.0 | Compatibility review, release gates below, migration guide, dependency notices, checksums, and measured limitations |

### N0 — decisions before a full implementation

- [x] Approve CLI applications as the initial native use case and the two-platform target matrix.
- [x] Write native semantics and the portable operation list; classify every Node-profile conformance fixture as shared, native-specific, or explicitly unsupported.
- [x] Validate the selected C backend and proposed runtime architecture in the N1 experiment; record collector and toolchain versions.
- [x] Define standard-library syntax without adding a globally reserved word.
- [x] Specify runtime error records, source-position conventions, stack limits, and allocation-failure behavior.
- [x] Define exact artifact dependencies and the meaning of “standalone” for each platform.
- [x] Specify inference, specialization budgets, unboxed/dynamic ABI boundaries, optimization settings, CPU baselines, and the benchmark protocol.

### N1–N2 — smallest useful proof and shared frontend

- [x] Emit C11 for a literal arithmetic/print program, compile it with the qualified native compiler, and link a working executable without an embedded JS engine.
- [x] Build a collector stress probe and inspect executable dependencies on both targets.
- [x] Separate syntax representation from JavaScript string emission in src/compiler.ts. Preserve token origins and UTF-16 positions in the AST and IR.
- [x] Adapt src/resolver.ts and src/project.ts to consume shared syntax/resolution data and an explicit execution profile.
- [x] Replace the JS emitter incrementally; compare behavior and source locations before removing the previous path. Avoid a second native-only parser.

### N3–N4 — correctness before optimization

- [x] Implement explicit numeric, conversion, string, indexing, identity, and short-circuit operations with evaluation-order tests.
- [x] Infer primitive types, specialize arithmetic/functions, and implement boxing/unboxing at dynamic boundaries with optimized-versus-unspecialized equivalence checks.
- [x] Implement managed lists/records, callable values, captured cells, initialization state, and collection roots.
- [x] Implement checked result/error propagation and source-aware runtime frames; cap recursive call depth before a native stack overflow.
- [x] Compile the full Arya module graph in dependency order with live exports and canonical path checks.
- [x] Test cyclic data, retained closures, repeated allocation, runtime faults, and failure during module initialization in debug and optimized builds.

### N5–N6 — usable tools and deployment

- [x] Specify and implement console, text-file, and math APIs with stable error and encoding behavior.
- [x] Extend src/cli.ts with explicit target/output handling while preserving all old invocation forms.
- [x] Invoke compiler/linker executables with argument arrays, deterministic configuration, and actionable missing-toolchain diagnostics.
- [x] Stage generated C, runtime objects, and executable; publish output only after successful compilation/linking. Invalidate builds by source, profile, runtime, toolchain, CPU, and flags.
- [x] Track .arya locations through C source mappings and explicit runtime frames. C line directives alone do not supply Arya column precision; retain an origin table for the promised columns. Toolchain failures must identify the failing stage/artifact and retain useful diagnostics. Full interactive debugging is deferred.
- [x] Establish debug/release pipelines and performance budgets; inspect optimized kernels for unboxed arithmetic and benchmark equivalent C and JS programs with retained raw results.
- [x] Carry profile configuration into the language service and LSP without changing existing default analysis.
- [x] Package runtime headers/libraries or a reproducible build recipe; include the chosen collector and other dependency notices.
- [x] Run the calculator and file utility after copying only the executable and declared redistributable files to a clean machine with no Arya, Node, Python, or compiler toolchain.

### N7 — release gates

- [ ] Stable 1.0 gates are complete; native additions pass a minor-version compatibility review.
- [x] Existing JS/compiler, LSP/editor, bridge, module, and installed-package checks pass. Run npm run check for the final integrated revision.
- [x] Both native platform jobs pass from clean installs with their qualified toolchain versions.
- [x] Shared-subset programs match declared Node-profile outcomes, including Unicode, numeric edge values, errors, and module behavior; compare normalized specified output rather than host stack wording.
- [x] Native feature rejection is tested in CLI and editor without executing source or invoking the C toolchain.
- [x] Memory-safety checks and collector stress pass with supported optimization settings. Long-running allocation tests show reclamation within a recorded tolerance rather than unbounded growth.
- [x] Copied executables run on the declared minimum OS/ABI environment without undeclared libraries or repository files.
- [x] Publish reproducible build instructions and artifact manifests/checksums, native profile specification, API/CLI reference, runnable examples, limitations, and migration notes.
- [ ] Record cold start, build time, executable size, peak memory, and representative throughput against equivalent optimized C and the JS target with toolchain/machine/input details. Meet the recorded per-workload budgets, explain material gaps, and demonstrate unboxed arithmetic in numeric kernels. Native status alone is not a promise of C/Rust performance.
- [x] Apply the existing licensing, security, release authority, and publication requirements to the actual native artifacts and bundled dependencies.

## 7. Principal risks and responses

| Risk | Response / gate |
| --- | --- |
| Reimplementing all of JavaScript makes 1.1 unbounded | Freeze a documented native profile in N0; reject host features and test every claimed portable operation |
| A second backend breaks existing programs/tooling | Shared frontend, explicit profiles, preserved API defaults, full JS regression gates |
| C lowering/optimization changes semantics or memory safety | Explicit ordering, checked helpers, no undefined C behavior, compiler diagnostics, sanitizer instrumentation and differential tests |
| Native code still spends too much time on dynamic operations | Required type inference/specialization, unboxed kernels, allocation measurements, generated-C/disassembly checks and equivalent C/JS benchmarks |
| Specialization causes excessive compile time or binary size | Bounded specialization with dynamic fallback; record build-time and code-size budgets |
| GC misses temporaries or retains too much memory | Traceable value layout, documented roots, optimized collection probes, retained-heap measurements |
| Binary works only on the developer's machine | Clean minimum-platform deployment tests and recorded dynamic library/ABI dependencies |
| “Native” is mistaken for universal library/GUI compatibility | Ship the concrete CLI examples and explicit profile/library support tables |
| Rewriting the compiler or promising every OS delays delivery | Keep TypeScript tooling and qualify two platforms before expanding |

## 8. Immediate next step

Implement N0's native profile draft and N1's tiny C/runtime experiment first. The experiment must produce a genuine executable for print(2 + 3), run without Node, and record generated-C compilation, object generation, toolchain, collector, linking, and dependency findings. Then validate argument handling with a small calculator and measure a runtime-input numeric loop against equivalent handwritten optimized C and JS. Use those findings to refine the C emitter/runtime architecture before the AST migration and full implementation.

No calendar estimate is committed until that experiment is measured and the team/available development time is known. Release gates determine completion; changing the package version alone does not.

## Implementation evidence

The shared AST/parser, native C emitter/runtime, CLI/API, native diagnostics, six standard libraries, sanitizer/GC tests, and AryaCode target integration are implemented for the alpha. The runtime collector is precise mark/sweep instead of the provisionally evaluated BDWGC. The Arya-written compiler includes numeric specialization and is verified with three generations, matching generation 2/3 C output, and native conformance programs. Native platform jobs and the existing release audit must pass for the exact release revision before publishing its platform claims. Stable 1.0 and external learner gates remain separate from an experimental alpha release.

The experimental native release is published as [1.1.0-alpha.1](https://github.com/HamzaArya/arya-lang/releases/tag/v1.1.0-alpha.1) and on npm under the next tag. Stable promotion and broader performance characterization remain distinct from this verified preview.
