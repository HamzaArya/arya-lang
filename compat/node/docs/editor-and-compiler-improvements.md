# Editor and compiler improvements

These changes are the **unreleased 1.3.0-alpha.10 source candidate**, following the published alpha.9.
Existing publication records and retained archives describe their original bytes.
Build this checkout to use these features; qualification for a new package is separate.

## Project-wide editor behavior

Both the portable LSP and the VS Code extension discover `.arya` files beneath
workspace folders, including closed files. Unsaved buffers override disk contents;
closing a buffer restores its disk version. File changes invalidate the disk index.
Analysis reads source and declaration files without executing JavaScript, Python,
database code or application initializers.

Go to Definition, references and rename link direct Arya namespace members across
files. Literal computed members such as `library["total"]` are included. Rename
checks lexical capture and collisions, and refuses exported changes when namespace
aliases/dynamic accesses or incomplete discovery could hide callers. References
honor the editor's include-declaration setting. Closed-file rename edits are returned
to the editor for its normal application flow.

Discovery excludes `.git`, `node_modules`, `dist`, `.build`, `artifacts`, `.arya`
and `__pycache__`. It does not follow source symlinks. Limits are 1024 source files,
16 MiB total source, 256 KiB per UTF-8 file and 8192 directories. Exceeding a limit
or encountering an unreadable source makes discovery incomplete and disables public
rename. With no file workspace, explicit snapshot/open-buffer behavior remains.
These editor limits describe the discovery scope, not runtime application limits.

The optional real-host harness applies rename edits, saves every affected file,
checks unsaved-buffer diagnostics and disk updates, toggles an Arya breakpoint,
evaluates a local value and steps through mapped statements. The portable extension
enables Arya breakpoints through the existing Node adapter. Host reports identify
actual editor and adapter versions. AryaCode's embedded providers are disabled in
the temporary profile, so these runs qualify the portable extension there; the
embedded compiler remains a separate product. See [debugger setup](syntax-and-debugging.md#breakpoints-and-stepping-in-vs-code-compatible-editors).

The shared analysis cache retains each unchanged module. An edit reparses that
module; importers are rechecked when exported contracts change. Navigation reuses
those analyses. A function-body-only edit with the same public signature preserves
its importers' analysis objects.

## Type boundaries

Checked modules now have static signatures for `list`, `web`, `mysql`, `python`,
`fs`, `json` and `env`, alongside decimal and datetime. List filtering, sorting,
taking and deduplication preserve input element types. Mapping infers callback
results or named record fields. `find` includes null. Python and database data
remain unknown until validated or given an explicit trusted boundary. Dynamic host
objects, Python bound proxies and libraries without declared signatures retain
their documented dynamic behavior. Types never insert runtime validation.

Project builds and editor discovery can consume a conservative `.d.ts` subset for
JavaScript imports in checked modules. Resolution reads npm `types`/`typings`,
exact package export `types` conditions, or adjacent local `.d.ts`/`.d.mts`/`.d.cts`
files. It never loads package entry points. Pure `compile`/`analyzeSource` remain
filesystem-free; embedders can supply a `moduleTypes` map explicitly.

The supported declaration subset includes named and default functions/values,
CommonJS `export = name`, local export aliases, a single matching ambient module,
earlier type aliases/interfaces, primitives, records, unions, arrays, Promise,
optional/rest parameters and callback types. Non-generic function overloads select
the first compatible signature; an incompatible call reports a type diagnostic.
At most 64 signatures are retained per overload. Emitted declarations and editor
signature/completion details preserve overloads. Pinned `escape-string-regexp@5.0.0`
and `fast-deep-equal@3.1.3` are exercised as real package consumers.

A declaration file is bounded to 256 KiB of UTF-8, 50,000 tokens and 30 nested type
operations. Expanded alias graphs are additionally bounded to 5,000 type nodes
and depth 30 before serialization. Generics, classes, external re-exports, namespaces beyond the single
ambient wrapper, mapped/conditional/literal types, package export patterns and
`typesVersions` are not interpreted. An unsupported construct or unresolved alias
discards that file's inferred contract, retaining the unknown boundary. Explicit
Arya import annotations take precedence. This is a bounded subset, not general
TypeScript compatibility. The reader only reads regular declaration files and
never runs package initializers.

## Mutation and control flow

Declared types remain the contract for writes; temporary narrowing describes a
particular read. Assigning null to a nullable variable after a guard is legal and
makes a subsequent member read unsafe. Normally completing branches join their
updated states. Returning/throwing branches do not widen the surviving path.
Loop writes are widened before checking an iteration, with the loop condition
then restoring supported guards. Catch/finally paths conservatively invalidate
writes from the protected block. Strict null and undefined comparisons remain
distinct, including short-circuit `and`/`or` guards.

Closures check captured mutable variables against their declared types. Calls,
constructors and await invalidate captured variables that a nested function can
write; this is conservative and can require another guard. A const snapshot is a
useful way to retain a checked value for a later callback. Existing mutable record
and array aliases must have compatible field/element types in both directions;
a fresh literal can initialize a wider shape. These restrictions prevent widening
an alias and mutating data behind a narrower reference. Array writes use the
element contract, while indexed reads still include undefined.

These checks do not model arbitrary host mutation, proxies/getters, dynamic `any`
values or full exception/effect/alias analysis. They insert no runtime validation.
Unannotated modules keep dynamic execution. See the [flow regressions](../tests/type-flow.test.ts)
and [declaration regressions](../tests/declarations.test.ts).

## Compiler phases and runtime size

`parseSource` constructs the AST, resolves names and checks types without creating
JavaScript. `emitProgram` then handles JavaScript syntax, imports, host-name
isolation and source origins. `compile` performs both phases and emits source maps;
`parseProgram` retains its lazy `body` compatibility property. The view parser also
constructs structured nodes instead of JavaScript strings. Analysis no longer
pays emission cost.

An iterative AST check bounds structural depth to 256, including long left-associated
expressions and member chains that do not consume recursive parser depth. Existing
source/token/parser limits remain. A bounded Arya diagnostic replaces stack overflow.
Generated programs include requested standard runtimes and their dependencies,
with deduplicated imports, rather than every standard library. The build script
bundles compiler entry points together to reuse esbuild's shared dependency work.

## Reproducible validation and timing

Run `npm run check` for type checks, generated release-status checks, documentation
links, compiler/runtime tests and the seeded cases. Generated cases compare 120
expression results with JavaScript, mutate 500 inputs with fixed seeds, exercise
large flat files/deep expressions and check selected runtime behavior.

Run `npm run benchmark` for seven warmed timing samples and their median. Results
are saved to `.build/performance/results.json`. The workload covers 200 functions,
a 201-module workspace, unchanged analysis, isolated edits, cached references and
generated program size. Timing is informational; correctness tests assert reuse
and invalidation behavior rather than unstable wall-clock thresholds. To compare
against a previously retained API bundle, use:

```sh
npm run benchmark -- --compare .build/performance/baseline.cjs
```

Keep the runtime, platform and exact source revision with any reported measurements.
The comparison file is optional and is not committed. Local timings do not establish
performance on other operating systems or real editor hosts.

## Release status

`docs/feature-status.json` generates availability tables in the documentation index
and tooling decisions; `docs:check` rejects drift. `docs/release-status.json` selects
an immutable publication record. Run
`npm run docs:sync` to regenerate the shared published-status paragraphs in the
README, stable plan and readiness guide. `npm run docs:check` rejects stale generated
paragraphs. Historical release evidence is retained separately from changed-source
qualification, and no local command in this workflow publishes packages.

## Source maintenance

Type representation/compatibility/serialization lives in `src/type-model.ts`;
source write-effect discovery lives in `src/type-effects.ts`; `src/types.ts` checks
expressions and statements. Parser and emitter retain their separate phases.
`npm run format` formats the explicitly listed core modules and regression files;
`npm run format:check` checks them without writing and runs in `npm run check`.
Other modules can adopt the same pinned formatter incrementally.
