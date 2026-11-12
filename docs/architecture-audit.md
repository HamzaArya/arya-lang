# Arya architecture audit — 11 November 2026

This audit starts the [master implementation plan](arya-master-plan.md). It describes
current implementation and gaps, not a declaration of production readiness.
The starting checkout contains the qualified local alpha.10 work and an alpha.11
accounting prototype in progress. Published status comes from
[the immutable publication record](releases/1.3.0-alpha.9-publication.json).
Existing changes, syntax, artifacts and external applications are preserved.

## Execution and compiler architecture

The active pipeline is source → tokenizer/parser → structured AST + lexical
resolution → bounded optional type checking → JavaScript emitter/source maps →
Node.js. There is no bytecode interpreter or general native executable backend. Alpha.12 adds a separate bounded scalar lowering/verified typed IR and LLVM host executable preview. `number` follows the existing
JavaScript numeric semantics; annotations do not insert runtime validators.

| Component | Implementation | Status and evidence |
| --- | --- | --- |
| Lexer/parser | [compiler.ts](../src/compiler.ts), canonical grammar, bounded recovery | Implemented; syntax, conformance, resolver and malformed-input tests |
| AST | [ast.ts](../src/ast.ts), structured views, binding/reference identities | Implemented; emitter consumes AST separately |
| Semantic analysis | [resolver.ts](../src/resolver.ts), scopes, writes, exports, diagnostics | Implemented; passive Check/editor tests |
| Types | [types.ts](../src/types.ts), [type model](../src/type-model.ts), [effects](../src/type-effects.ts) | Partial static system: inference, shapes/unions, checked boundaries and conservative flow; no machine-width types or general generics |
| JS backend | [emitter.ts](../src/emitter.ts), [maps](../src/source-map.ts) | Implemented; runtime/source-map/consumer tests |
| Projects | [project.ts](../src/project.ts), graph ordering, containment, cached compilation, staged publication | Implemented; cycles, cancellation, stale output, ownership and relocation tests |
| Standard runtime | [standard.ts](../src/standard.ts), selected library source embedded per module | Implemented; modular selection exists, member-level/shared-graph elimination remains an opportunity |
| Tooling | [language service](../src/language-service.ts), workspace index/cache, LSP and editor adapters | Implemented within documented discovery limits; protocol tests and version-specific local host evidence |
| Native kernel | [accounting C++ core](../native/accounting/kernel.h), Node-API wrapper | Implemented local prototype; narrow exact arithmetic only, requires Node host |
| General native compiler/runtime | Historical C11 backend, [archived contract](history/arya-native-specification.md) | Historical, retired from active 1.3 line; not a current supported backend |
| Typed IR/optimizer | [Structured scalar IR](../src/native-ir.ts), [shared lowering](../src/native-lower.ts) | Implemented preview with verifier and deterministic inspection; general language IR/optimizer incomplete |
| Native scalar backend | [LLVM emission](../src/native-backend.ts), [explicit build driver](../src/native-preview.ts) | Implemented preview; independent host execution, broader coverage/platforms unqualified |
| Wasm/backend-independent runtime | No active implementation | Missing; a Node addon is not Wasm or a standalone runtime |

The compiler's synchronous parse/analyze APIs perform no module execution or
filesystem discovery. Project/editor layers read contained sources/declarations.
JavaScript/Python imports execute only through application execution. No second
parser or independent editor resolver is justified.

## Financial and numerical foundation

| Capability | Classification | Actual boundary |
| --- | --- | --- |
| Decimal string arithmetic | Implemented | Pinned decimal.js, private 4096-significant-digit context, explicit rounding/limits; not a Decimal128 language type |
| Exact bounded invoice/ledger batches | Implemented prototype | BigInt portable kernel; checked native 64-bit inputs/line outputs and 128-bit intermediates; independently tested policy |
| Currency context | Partial | Three-letter application tag and explicit scale; no ISO registry lookup or language-level Money type |
| Native integer arithmetic | Partial | Private batch-kernel representation; not signed/unsigned/bigint Arya primitive types |
| Arbitrary-precision integers | Partial | Host `BigInt` is accessible, but primitive syntax/type semantics and a general integer library are missing |
| Financial invariants | Partial | Per-line bounds, exact totals, balances, explicit rounding and pure outputs; not journal posting/business authorization |
| FX rates/history, ISO catalog, multi-currency Money | Missing | Needs versioned catalog, typed values, conversion metadata and independent reference vectors |
| Decimal128 | Missing | Existing arbitrary-decimal wrapper is not a conforming Decimal128 implementation |
| Double-entry journals, costing, payroll, statements | Missing reusable packages | No implicit financial compliance or production financial audit |
| Matrices/SIMD/scientific library | Missing | Separate approximate numerical ecosystem; never silently reuse floating point for money |
| Parallel calculation engine | Missing as an official API | Current batch async scheduling cooperates on one thread; Node workers remain application-owned |

General decimal contracts remain unchanged. The new prototype's narrower bounds
and per-line rounding policy are explicit. No precision reduction or floating-point
replacement is used to obtain its benchmark results.

## Interoperability, runtime and enterprise APIs

- Node/npm imports, generated Arya exports and `.d.mts` declarations work through
  the existing JS backend. The conservative declaration reader is a bounded
  subset, not complete TypeScript interoperability.
- Python calls use explicit JSON/process boundaries; managed batches, bounded
  queues, cancellation and interpreter selection exist. Official Python-to-Arya
  native bindings, NumPy zero-copy ownership and persistent cross-call objects do not.
- The native kernel uses Node-API 9. It does not establish a stable public C ABI,
  Python extension ABI, universal native package, or Node-independent execution.
- Node/V8 owns general application memory and concurrency. Native batch calls
  borrow ordinary typed buffers synchronously, reject shared/detached buffers and
  allocate bounded result vectors with C++ RAII. There is no language ownership change.
- HTTP, services, validation, logging, UI/motion, Electron starters, environment,
  files, JSON, testing and vetted Node cryptography are implemented with stated
  limits. Cryptographic primitives are delegated to Node/OpenSSL.
- MySQL has prepared values, pools, transactions, context and decimal-safe string
  transport. Official PostgreSQL/SQLite wrappers, migration tooling and explicit
  isolation/retry contracts remain missing. Ambiguous commits must not be retried blindly.
- Arya Ledger is not modified or required. Financial examples are synthetic and
  application-independent; no live business database is used.

## Toolchain and distribution gaps

Implemented CLI: `--version`, `create`, constrained `init`, `editor`, `run`, `check`,
`build`, `fmt`, `lint`, `test`, and the separate experimental `native` command. Build currently needs an explicit `.arya` entry.
`new`, entry inference, release/native flags, `bench`, `doc`, `add`, `update`,
`publish`, `doctor` and a REPL are not currently advertised as working commands.
Do not add placeholder handlers to satisfy the target command list.

Package management uses npm package manifests/lockfiles/integrity and a creator.
There is no independent Arya dependency resolver or registry. Existing deterministic
editor archives, candidate snapshots, checksums and read-only release audit do not
constitute signed, publicly published stable releases. Runtime, compiler and editor
versions are recorded separately.

## Bottlenecks and reliability findings

1. Decimal wrappers repeatedly parse/format strings. Generated decimal and UI
   programs include whole selected libraries. Account-specific batch/column work
   addresses the former; member/shared runtime decomposition needs separate evidence.
2. Native speed depends on workload. Preliminary invoice measurements favor native
   arithmetic, while small/account-dense ledger work can favor JS. Final retained
   results must distinguish prepared arithmetic, end-to-end validation, startup and RSS.
3. Native buffers are a new memory-safety boundary: strict type/size/detachment
   checks, checked intermediates, independent reference tests and sanitizers are
   required. macOS AddressSanitizer here lacks leak detection; do not claim that check ran.
4. A newly added intentional-invalid-input test initially failed TypeScript because
   the invalid getter was typed as a valid invoice. The boundary cast is corrected;
   type checking and runtime tests pass. An isolated package consumer also exposed
   inferred Node-only public declaration types. An explicit public information
   interface removes that development dependency; standalone type checks now pass.
5. SECURITY.md's active-version text predated the selected publication record.
   It now uses the shared generated status; reporting contacts and support
   commitments are preserved.
6. Existing resource bounds and contained publication reduce specific risks; this
   source review is not a complete adversarial or production financial security audit.
7. Native Linux/Windows, broad ecosystem compatibility, signed releases, external
   learner findings and stable support commitments require new evidence for this revision.

## Qualification baseline and disposition

Alpha.10's retained local report records 344 passing enabled tests on Node 22.15.0,
24.16.0 and 26.13.0, plus separate optional integrations. Those results describe its
bytes, not this changed checkout. Alpha.11's local Node 24
regression run passed 359 tests with four optional integration skips, including
15 focused accounting cases and native/Python comparison. Independent portable
and native package consumers passed. The [milestone report](accounting-milestone.md)
records final runtime, source-snapshot and performance evidence separately.

The [target architecture](architecture-target.md) separates language, frontend, IR,
backends, runtimes and libraries. The [roadmap](implementation-roadmap.md) defines
small verified gates rather than replacing the current architecture in one change.
Final alpha.11 outcomes belong in its milestone report, including failures and skips.

Alpha.12 native changes and their exact verification scope are recorded in the [native milestone](native-milestone.md).
