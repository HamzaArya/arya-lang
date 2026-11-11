# Arya roadmap and implementation history

> Archived milestone plan through 1.3.0-alpha.3. The original version-specific statements, checkboxes, and progress notes below preserve the planning record. Use the [current roadmap](../arya-roadmap.md) and [release readiness](../release-readiness.md) for active scope and qualification.

**Status at archival:** Living implementation plan  
**Created:** 8 November 2026  
**Current source version:** Arya 1.3.0-alpha.3 (Node.js-only candidate); npm baseline 1.2.0-alpha.4
**Implementation status:** [source maps](../source-maps.md); [core specification](../arya-specification.md); [current release notes](../releases/1.2.0-alpha.4.md)
**Related audit:** [Arya Language Logic Report](arya-language-logic-report.md)

## Current direction — 10 November 2026

Arya focuses on readable Node.js applications combining JavaScript/npm and Python. The 1.3.0-alpha.2 source candidate retires native compilation and concentrates on five application templates, services/databases, UI/motion, Electron desktop apps, and editor quality. See [runtime and migration](../node-runtime.md) and [candidate notes](../releases/1.3.0-alpha.2.md).

The published npm baseline remains 1.2.0-alpha.4; its exact archives and native-inclusive evidence are historical facts. No new npm publication is implied by the source refocus. The roadmap's original milestone plans and logs below remain history; native/compiler milestones are no longer active product work. Current qualification is tracked in [release readiness](../release-readiness.md).

The current candidate also adds [readable application flow](../flow-syntax.md): pipelines, concise/default/rest functions, spreads, guards, indexed loops, finally cleanup, and collection helpers. Older forms remain accepted with the documented guard-keyword migration.

The 1.3.0-alpha.3 UI candidate adds ten components, eight [reusable sections and four full-page templates](../ui-patterns.md), live galleries, and copyable examples. It retains the alpha.2 syntax contract.

## Original milestone plan

## Purpose

This original plan takes Arya from the 0.1 prototype to a dependable 0.2 release, then toward a stable 1.0 language. It is written as a working document: tasks have IDs, dependencies, acceptance criteria, and checkboxes so progress and design decisions can be recorded here.

The first user-visible goal is deliberately narrow:

> A runtime failure must point to the original `.arya` file, line, and useful column through both the CLI and AryaCode.

Arya 0.2 then adds a written language contract, lexical name resolution, first-class Arya modules, stronger interoperability errors, and a clean installation path. Arya 1.0 adds the stability, learning material, platform verification, licensing, and compatibility policy expected of a language other people can build on.

## Product direction

Unless a later language decision explicitly changes it, Arya will keep JavaScript-compatible values and Node.js execution as its default direction. This preserves direct access to JavaScript and npm while Arya develops its own syntax, compiler checks, modules, tooling, and interoperability contracts.

The following work was outside the original Arya 0.2 scope (later previews added native execution and optional managed Python clients):

- a native-code backend or Arya virtual machine;
- a static type system;
- a persistent Python worker;
- source-level breakpoints and stepping;
- a package registry or third-party Arya package manager;
- Unicode identifier syntax;
- broad new syntax unrelated to the release goals.

These items can be reconsidered after 0.2 based on real use. Source maps in 0.2 prepare for debugging, but readable stack traces are a separate deliverable from an interactive debugger.

## Release success criteria

Arya 0.2 is complete when a new user can:

1. install the packaged Arya CLI without a repository checkout;
2. run, check, and build a single-file program;
3. build and run a multi-file Arya program from one entry point;
4. see an original `.arya` location for a runtime failure in any module;
5. catch misspelled lexical names and writes to `const` before execution;
6. use the documented JavaScript and Python examples;
7. understand the supported semantics and runtime requirements from versioned documentation.

Arya 1.0 is complete when the project also has a stable specification, compatibility policy, settled licensing and distribution terms, verified platform support, and evidence that people outside the implementation team can learn and use it successfully.

## Working rules

Every milestone follows these rules:

- Start with an observable failing test or documented gap.
- Preserve existing 0.1 behavior unless a decision record explicitly approves a change.
- Keep parsing and analysis non-executing: editor features and `arya check` must not import or run project code.
- Add tests at the lowest useful layer and at one user-facing path.
- Match stable parts of error output rather than complete Node/Python messages that can vary by version or platform.
- Treat Windows paths, spaces, Unicode text, and workspace containment as normal cases.
- Update the language reference, tutorial, and release notes in the same milestone as behavior changes.
- Run `npm run check` before marking implementation work done.

## Status legend

| Mark | Meaning |
| --- | --- |
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete and verified |
| `[!]` | Blocked; explain the blocker in the decision log |

## Roadmap overview

| ID | Milestone | Target | Depends on | Status |
| --- | --- | --- | --- | --- |
| M0 | Standalone repository and versioned IDE package integration | 0.2 | — | `[x]` |
| M1 | Arya source maps and readable runtime traces | 0.2 | M0 | CLI/compiler/package CI passes all three OS jobs; non-macOS desktop qualification pending |
| M2 | Normative 0.2 language specification | 0.2 | M1 can proceed in parallel; must finish before release | `[x]` |
| M3 | Lexical name resolution and stronger `check` | 0.2 | M2 scope decisions | `[x]` |
| M4 | Arya-to-Arya modules and build graph | 0.2 | M1, M3 | `[x]` (local CLI, IDE, standalone extension) |
| M5 | Interoperability hardening and examples | 0.2 | M2 | `[x]` (Node 22.15/24, Python 3.13, macOS arm64) |
| M6 | Package, compatibility test, and release Arya 0.2 | 0.2 | M1–M5 | `[~]` (Apache-2.0 alpha.3 published; final 0.2 and remaining desktop/architecture qualification pending) |
| M7 | Learning path and community review | pre-1.0 | M6 | `[~]` (runnable path/protocol ready; external sessions pending) |
| M8 | Tooling investments chosen from user evidence | pre-1.0 | M7 | `[~]` (engineering evidence/defer record prepared; learner evidence pending) |
| M9 | Specification, compatibility, and stable release | 1.0 | M7–M8 | `[~]` (policy/security/readiness prepared; stable release not qualified) |

---

## M1 · Arya source maps and readable runtime traces

### Outcome

Runtime stack traces identify the original Arya source location instead of only a generated `.mjs` location. This must work through `arya run`, AryaCode Run, and a built module launched with Node's source-map support enabled.

### M1.1 · Add the failing acceptance fixture

- [x] Add `fixtures/arya/runtime-error.arya`:

  ```arya
  fn fail() {
    const item = null
    return item.name
  }
  fail()
  ```

- [x] Add a CLI-level integration test that runs this source through the real Arya run path.
- [x] Assert a nonzero exit status.
- [x] Assert that stderr contains `TypeError`.
- [x] Assert a mapped frame for `runtime-error.arya:3` and a caller frame for `runtime-error.arya:5`.
- [x] Add the exact column assertion only after expression mappings exist. `name` begins at one-based column 15.
- [x] Normalize path separators or match only stable path suffixes so the test runs on Windows, macOS, and Linux.

The first red test should require only correct lines. Column precision becomes a second red test, preventing the implementation from trying to solve every mapping detail at once.

### M1.2 · Define the compiler output contract

Extend the compile contract in [`packages/arya/src/compiler.ts`](../../src/compiler.ts) so compilation receives the original source filename and intended generated filename, then returns source-map data with the generated code. The intended shape is conceptually:

```ts
interface CompileOptions {
  filename: string;
  outputFilename: string;
}

interface Compilation {
  code: string;
  map: string;
  mapFilename: string;
  symbols: AryaSymbol[];
  usesPython: boolean;
}
```

The exact API can preserve a compatibility overload for existing callers. The important point is that the compiler must know the real output filename before it finalizes the map and `sourceMappingURL`; it must not guess `program.mjs` or a CLI-only name. Analysis callers may use a deterministic virtual generated filename because they do not write or execute the output.

These rules must hold:

- [x] The compiler produces the map; CLI and AryaCode only write it.
- [x] `compile()` remains side-effect free and never writes files.
- [x] The map names the generated file and the original `.arya` source.
- [x] The source path is relative to the map when practical and uses URL-style `/` separators.
- [x] `sourcesContent` contains the Arya source so the map remains inspectable if generated output is moved.
- [x] Injected runtime and Python bridge regions remain unmapped to Arya source. Their caller frames may map to Arya, but runtime implementation lines must not be falsely attributed to user code.
- [x] Generated code ends with a relative `sourceMappingURL` comment.

Before adding a dependency, record the selected source-map encoder and why it was chosen in the decision log. Prefer a maintained encoder over a handwritten Base64 VLQ implementation.

### M1.3 · Preserve mappings while generating code

The current parser returns nested JavaScript strings before their final generated positions are known. Do not attempt to recover mappings by searching the final string: repeated identifiers and formatting changes make that unreliable.

Implemented a source-preserving emission layer using explicit token-origin annotations in composed strings. The final emitter consumes the annotations and records generated line/UTF-16 columns after all runtime prefixes. This avoids searching generated identifiers or guessing offsets. See [the implemented design](../source-maps.md).

- [x] Add generated-position tracking.
- [x] Record statement and expression origins as fragments are created.
- [x] Preserve origins through nested expressions and blocks.
- [x] Remove all internal annotations before writing generated output.
- [x] Verify marker-like literal data cannot inject source origins.

Minimum expression-level mapping targets:

- identifiers and literals;
- function and method calls;
- property names in `value.property`;
- index expressions in `value[index]`;
- unary and binary operators;
- assignment targets and values;
- `await`, `new`, `return`, and `throw` operands.

If fragment composition begins reproducing a parser tree indirectly or becomes difficult to reason about, stop and introduce a small AST with source spans. That is an approved design adjustment, not a failure of the milestone.

### M1.4 · Write map artifacts in every build path

- [x] Determine and validate the output path before compilation, then pass its generated filename into the compile contract.
- [x] In [`packages/arya/src/cli.ts`](../../src/cli.ts), write `<output>.map` beside the generated `.mjs` for both `build` and `run`.
- [x] In [`packages/services/src/language-runner.ts`](repository-extraction.md), write the map inside the same fingerprinted `.arya/run` directory as `program.mjs`.
- [x] Apply existing `containedPath` checks separately to the map path in AryaCode.
- [x] Write code and map only after compilation succeeds so a syntax failure cannot create a partially updated pair.
- [x] Decide whether two-file replacement needs temporary files and rename. Record the decision; at minimum, never write a new module referring to a missing new map.
- [x] Keep `.map` artifacts covered by the existing `.arya/build` and `.arya/run` ignores.

### M1.5 · Enable source maps in runners

- [x] Change CLI execution to `node --enable-source-maps <generated.mjs> [...programArgs]`.
- [x] Change AryaCode execution to put `--enable-source-maps` before the generated module path.
- [x] Preserve all program arguments literally after the module path.
- [x] Document standalone execution as `node --enable-source-maps path/to/program.mjs`.
- [x] Verify behavior on the minimum supported Node version, not only the developer's current Node version. Node 22.15.0 passes compiler/CLI, clean-package, and AryaCode runner acceptance on macOS arm64.

Plain `node program.mjs` is not part of the mapped-stack acceptance contract unless supported Node versions enable source maps without a flag.

### M1.6 · Mapping acceptance matrix

Add focused fixtures or generated temporary sources for each case:

| Case | Required observation | Status |
| --- | --- | --- |
| Simple property access | failing line and property column map to `.arya` | `[x]` (macOS arm64) |
| Caller frame | caller maps to the Arya call site | `[x]` (macOS arm64) |
| Two expressions on one line | each failure can map to a distinct column | `[x]` (macOS arm64) |
| Multiline expression | failing nested expression maps to its actual source line | `[x]` (macOS arm64) |
| Failure after `await` | async stack contains the mapped Arya frame | `[x]` (macOS arm64) |
| Path with spaces | original path is readable and correct | `[x]` (macOS arm64) |
| Unicode before error | UTF-16 column agrees with LSP/editor positions | `[x]` (macOS arm64) |
| Built-in failure | runtime frame may be generated; Arya caller is mapped | `[x]` (macOS arm64) |
| Python bridge failure | bridge frame may be generated; Arya caller is mapped | `[x]` (macOS arm64) |
| CLI run | mapped trace appears | `[x]` (macOS arm64) |
| AryaCode run | mapped trace appears | `[x]` (macOS arm64) |
| Standalone build | mapped trace appears with `--enable-source-maps` | `[x]` (macOS arm64) |
| Existing JS import | imported-library frames are not falsely mapped to Arya | `[x]` (macOS arm64) |

### M1 definition of done

- [x] The acceptance fixture reports `runtime-error.arya:3:15` and a caller at line 5.
- [x] Qualify the passing local matrix on minimum Node 22.15.0 (macOS arm64).
- [~] [CI run 42566241620](https://github.com/HamzaArya/arya-lang/actions/runs/42566241620) passes all six compiler/conformance/CLI/package jobs on Linux, Windows, and macOS with Node 22.15/24. Non-macOS AryaCode/desktop and additional architecture qualification remain separate.
- [x] Generated runtime regions are not falsely mapped to the user source.
- [x] `arya run`, AryaCode Run, and standalone mapped execution behave consistently.
- [x] Existing tests pass.
- [x] The language reference and tutorial no longer say runtime stacks point only to generated JavaScript.

---

## M2 · Normative Arya 0.2 language specification

### Outcome

Arya behavior is explicit enough that a program's result can be predicted without reading the compiler. The specification distinguishes required language behavior from Node implementation details and experimental behavior.

### Work

- [x] Complete the normative core specification, with approved M3/M4 design clearly separated from current features.
- [x] Specify lexical grammar: identifiers, keywords, comments, strings, escapes, numbers, and limits.
- [x] Specify statement grammar and newline/semicolon behavior.
- [x] Specify operator precedence and associativity in one normative table.
- [x] Specify scopes, shadowing, declarations, closures, and declaration timing.
- [x] Specify JavaScript-compatible values, mutation, truthiness, equality, arithmetic, and conversions.
- [x] Specify built-ins and exact error conditions.
- [x] Specify host globals as an explicit compatibility surface rather than an accidental Node detail.
- [x] Specify JavaScript imports, Arya imports, exports, and Python bridge behavior.
- [x] Label implementation limits separately from semantic rules.
- [x] Give every surprising rule a runnable example or conformance test.

### Required decisions

Record each answer in the decision log before M3 relies on it:

- [x] Does `-2 ** 2` remain `4`, or change to the more common `-(2 ** 2)`, which is `-4`?
- [x] Which Node/ECMAScript globals are guaranteed by Arya 0.2?
- [x] Are function declarations visible throughout their scope?
- [x] Is use before a `let`/`const` declaration a compiler error, a runtime error, or allowed when execution occurs later through a closure?
- [x] Are `and` and `or` guaranteed to return operand values?
- [x] How are `NaN`, infinity, and negative zero documented and transported across bridges?
- [x] Is an intentional JavaScript default export of `null` allowed, and if so how is it distinguished from a namespace fallback?

### M2 definition of done

- [x] The specification covers every construct accepted by the parser.
- [x] Parser/runtime behavior and documentation agree.
- [x] Every approved behavior change has a migration note and test.
- [x] The language reference points to the specification without duplicating conflicting rules.

---

## M3 · Lexical name resolution and stronger `arya check`

### Outcome

`arya check` reports unknown lexical names and illegal writes to `const` without executing code. The same analysis data can later power navigation and richer completion.

### Design

Separate these concerns:

1. parsing creates source-positioned declarations, references, and assignment targets;
2. scope construction records declarations for each module, function, block, loop, and catch clause;
3. resolution binds each lexical reference to a declaration or documented host global;
4. validation reports unresolved references and assignment violations.

Property names after `.` are not lexical references. Object literal keys are not lexical references unless future shorthand syntax explicitly makes them so.

### Work

- [x] Represent declaration kind: `let`, `const`, function, parameter, loop variable, catch variable, or import alias.
- [x] Represent lexical references and assignment targets with source tokens.
- [x] Build scopes in a pass that supports the M2 declaration-timing decisions.
- [x] Resolve closures and legal nested shadowing.
- [x] Diagnose unknown names with a precise range and, when reliable, a close-name suggestion.
- [x] Diagnose direct and compound assignment to `const`.
- [x] Include Arya built-ins and the approved host-global allowlist.
- [x] Preserve non-executing analysis for missing JavaScript/Python packages.
- [x] Return multiple independent diagnostics where parser recovery permits it; keep parser recovery itself outside M3 if it would delay the release.
- [x] Reuse resolved symbols for go-to-definition if the core work makes it small and reliable. Do not make navigation a release blocker.

The parser records source tokens and lexical scope facts; `src/resolver.ts` resolves the completed scopes in a separate pass. For headers have a loop scope distinct from the body, so body declarations cannot incorrectly capture iterable references. The loop binding is also seeded into the body to preserve Arya's duplicate-loop-name rule. Resolution metadata feeds same-file definition lookup in the portable extension, LSP, and AryaCode. Syntax recovery remains outside M3; complete parses return all independent semantic diagnostics.

### Required tests

- [x] misspelled local, parameter, import alias, and outer closure name;
- [x] direct and compound write to `const`;
- [x] valid nested shadowing;
- [x] closure reading an outer binding;
- [x] loop and catch variables inside and outside their scopes;
- [x] properties that match no lexical name;
- [x] approved host globals;
- [x] duplicate declarations and parameters continue to fail;
- [x] imports remain passive during analysis;
- [x] diagnostics have correct UTF-16 ranges.

### M3 definition of done

- [x] A misspelled variable fails `arya check` before execution.
- [x] Assignment to `const` fails `arya check` before execution.
- [x] Valid shadowing, recursion, closures, imports, and host globals pass.
- [x] CLI, embedded AryaCode analysis, portable extension, and portable LSP use the same resolver, including registered-provider desktop acceptance.
- [x] Existing completion and Outline behavior does not regress.

---

## M4 · Arya-to-Arya modules and build graph

### Outcome

One entry command compiles and runs a multi-file Arya program. Every module receives its own source map, and a failure in a dependency points to that dependency's `.arya` source.

### Implemented 0.2 module surface

Use the existing bridge-shaped syntax for namespace imports:

```arya
use arya "./math.arya" as math

print(math.add(2, 3))
```

```arya
# math.arya
export fn add(left, right) {
  return left + right
}
```

For 0.2, keep the surface deliberately small:

- relative paths only;
- explicit `.arya` extension;
- namespace imports only;
- existing `export fn`, `export let`, and `export const` declarations;
- no re-exports, wildcard syntax, package imports, or dynamic imports;
- cycles rejected with a readable import chain.

Approved by M2 and implemented in alpha.3; see specification section 11 and `arya-language/project`.

### Graph and output design

- [x] Resolve every Arya import relative to its importing source file.
- [x] Canonicalize file identities so aliases and symlinks do not compile the same module twice.
- [x] In AryaCode, enforce workspace containment on every source and output.
- [x] Define the CLI project boundary: the canonical entry file's directory is the module root; lexical/canonical Arya imports and generated output cannot escape it. The project API can take an explicit containing root; the CLI and IDE defaults agree.
- [x] Build the dependency graph without executing modules.
- [x] Produce deterministic topological order.
- [x] Reject cycles with the complete shortest discovered chain, for example `a.arya → b.arya → a.arya`.
- [x] Compile each source once per build.
- [x] Mirror module paths under the generated output directory and rewrite Arya imports to generated relative `.mjs` specifiers.
- [x] Emit a map beside every generated module.
- [x] Prevent stale generated dependencies from being executed after any graph compile failure.

Recommended CLI layout for an entry directory:

```text
project/
  main.arya
  lib/math.arya
  .arya/build/
    main.arya.mjs
    main.arya.mjs.map
    lib/math.arya.mjs
    lib/math.arya.mjs.map
```

AryaCode may keep its fingerprinted `.arya/run/<id>/` root but should mirror the same graph beneath it.

### Required tests

- [x] entry imports and calls one dependency;
- [x] transitive dependency;
- [x] two modules share one dependency, compiled once;
- [x] nested directories and `../` normalization within the project boundary;
- [x] missing module with importer location;
- [x] cycle with full import chain;
- [x] dependency syntax failure with dependency source location;
- [x] dependency runtime failure mapped to dependency `.arya` location;
- [x] duplicate alias and symlink identity behavior;
- [x] attempted workspace/project escape;
- [x] JavaScript and Python imports continue to work inside dependencies;
- [x] exports preserve live JavaScript module behavior as specified.

### M4 definition of done

- [x] A multi-file program builds and runs with one command.
- [x] CLI and AryaCode resolve the same graph for equivalent project boundaries, including real desktop Build/Run of the multi-file project.
- [x] Source maps work for every module.
- [x] Missing files, invalid exports, and cycles produce source-positioned diagnostics.
- [x] A failed graph build cannot launch stale output.

---

## M5 · Interoperability hardening and examples

### Outcome

Common JavaScript and Python failures explain what happened, where it happened, and what the user can do. Published examples demonstrate efficient, supported patterns.

### Python bridge matrix

- [x] missing Python executable;
- [x] missing installed module;
- [x] missing local `.py` file;
- [x] private member access;
- [x] `then` and `with` proxy-name limitations documented and tested;
- [x] unsupported input: function, symbol, bigint, `undefined`, non-finite number, and cyclic object;
- [x] unsupported Python return value;
- [x] Python exception type and message;
- [x] worker timeout;
- [x] oversized stdout/stderr/response;
- [x] malformed or truncated protocol response;
- [x] Python logging forwarded without corrupting the response;
- [x] path with spaces and Unicode;
- [x] batch processing in one call.

### JavaScript interop matrix

- [x] namespace-only ES module;
- [x] ordinary default export;
- [x] intentional `null`/`undefined` default behavior from M2;
- [x] CommonJS package;
- [x] callback and method receiver preservation;
- [x] constructor and async function;
- [x] missing package and missing export behavior;
- [x] mapped Arya caller frame when library code throws.

### Examples and messages

- [x] Add one small npm project example with explicit installation steps.
- [x] Add one Python batch example that avoids a process launch inside an Arya loop.
- [x] Give bridge errors stable Arya-facing prefixes or codes where that improves supportability.
- [x] Keep underlying exceptions useful without exposing an uncontrolled traceback as structured protocol data.
- [x] Update tutorial troubleshooting for interpreter selection, JSON limits, timeouts, and batching.

### M5 definition of done

- [x] Every matrix case has a test or an explicit documented limitation.
- [x] Common bridge failures give actionable messages.
- [x] A new user can run both examples from the published instructions.
- [x] Interop errors retain mapped Arya caller frames.

---

## M6 · Package and release Arya 0.2

### Outcome

Arya 0.2 is installable and testable independently of the repository checkout.

### Release gates

- [x] Adopt Apache-2.0 and Copyright 2026 Hamza Arya, retain LICENSE/NOTICE/third-party notices, and prepare public `arya-language` alpha metadata. The owner selected npm `next` plus a GitHub prerelease; alpha.3 live publication is now verified in the post-release record.
- [x] Update `ARYA_VERSION`, extension version, documentation, and package metadata together for alpha.3; final 0.2 public version awaits release qualification.
- [x] Keep Arya language version 0.2 separate from the AryaCode product version in all UI and release text.
- [x] Publish supported Node versions and the Python versions/platforms actually tested.
- [x] Document installation, upgrade, uninstall, and local-project use.
- [x] Write release notes with behavior changes and migration guidance.
- [x] Build the alpha.3 tarball/VSIX/editor kit from reviewed committed source `5a962385e1bdf35c8476748b992dc7efb0a01e2f` with fresh dependency installation and retained source-manifest/log evidence.
- [x] Install the tarball into a temporary project with no repository-relative dependency access.
- [x] Run `arya --version`, `check`, `build`, and `run` from that clean install.
- [x] Run the multi-file example and intentional runtime-error example.
- [x] Verify packaged maps contain correct sources and no accidental repository-only paths.
- [x] Verify the portable LSP and editor extension still match compiler 0.2 semantics, including separate embedded/portable desktop profiles.
- [~] All six configured compiler/conformance/CLI/package CI jobs pass for alpha.3. Editor archive builds and desktop acceptance are local macOS evidence; untested desktop/platform/architecture claims remain open.

### M6 definition of done

- [ ] All M1–M5 definitions of done are satisfied.
- [x] `npm run check` passes from a clean dependency install in the recorded isolated source snapshot.
- [x] Clean-install acceptance passes without source-repository-relative dependencies, including the real installed command, lessons, modules, npm and Python examples.
- [x] The published alpha.3 artifact set includes verified checksums, notices, Apache-2.0 license, and matching version labels. This closes the prerelease artifact gate only; final 0.2 qualification remains open.
- [x] Alpha.3 candidate release notes link to the versioned specification, tutorial/learning material, API, migration, and readiness records.

---

## M7 · Learning path and community review

### Outcome

People who did not build Arya can learn it, complete a small project, and report where the experience breaks down.

### Work

- [x] Write a short learning path that starts with one file and ends with a multi-file project using one interop feature.
- [x] Include exercises, expected output, common errors, and a completed reference project.
- [~] Automated installed-package acceptance runs the nine shipped lessons, multi-file learning reference, offline npm example, and Python batch example; an external-registry Express install is not qualified by the offline run.
- [ ] Recruit a small group of learners and developers who were not involved in implementation.
- [ ] Include Afghan programmers and learners where possible so Arya's intended identity is reflected by real participation.
- [ ] Observe installation, first run, rule comprehension, error diagnosis, modules, and interop.
- [ ] Record issues without coaching users past them unless they are blocked.
- [ ] Rank findings by frequency, severity, and whether the problem is language, tooling, documentation, or packaging.

### Language and identity notes

Dari and Pashto learning material would strengthen Arya's Afghan identity when fluent reviewers can verify it. Translation is a documentation project. Allowing identifiers in Arabic-derived scripts is a separate language feature requiring lexer, source-position, normalization, editor, font, bidirectional-text, and diagnostic testing. Do not combine those scopes accidentally.

Before using “the first Afghan programming language” publicly, define the qualification criteria and conduct a separate historical review. The code audit establishes Arya's implementation; it does not prove historical priority.

### M7 definition of done

- [x] The completed task-report learning reference checks/builds/runs from the installed package without third-party fetches; actual beginner observations remain the separate external gate.
- [ ] External participants complete or attempt the project.
- [ ] Findings produce a prioritized evidence log rather than anecdotal feature requests.
- [ ] Any translated material has fluent review.

---

## M8 · Tooling investments chosen from user evidence

### Outcome

Pre-1.0 work addresses the highest-impact problems observed in M7 instead of assuming which tools users need.

Candidate investments include:

- formatter and formatting specification;
- parser recovery and multiple diagnostics;
- go-to-definition, references, and rename;
- signature help and imported-library completion;
- clearer runtime diagnostics;
- persistent/async Python bridge;
- faster incremental module builds;
- source-level debugging;
- Unicode identifiers and bidirectional editor behavior.

### Selection gate

For each proposed investment, record:

- observed user problem;
- affected user count and severity;
- smallest change that solves it;
- specification impact;
- compatibility risk;
- implementation and maintenance cost;
- acceptance test.

Do not put every candidate into 1.0. Select the smallest set required for dependable use and defer the rest with explicit rationale.

### M8 definition of done

- [x] Selected engineering mitigations trace to reproduced graph ownership/FIFO/export and UTF-8 byte-bound risks; no external learner evidence is claimed.
- [x] Each selected engineering item has its own acceptance tests and compatibility/maintenance assessment in docs/tooling-evidence.md.
- [x] Deferred tooling remains visible with evidence-based revisit triggers; final learner-driven selection remains pending M7.
- [ ] Review real M7 findings before finalizing the learner-driven 1.0 tooling selection. The checked items above close the engineering-risk portion only.

---

## M9 · Arya 1.0 stable release

### Outcome

Arya has a documented stable core that users can install, learn, use for small real projects, and upgrade with clear expectations.

### Stability and governance

- [ ] Publish the Arya 1.0 specification after owner/platform/community qualification; the implemented 0.2 core contract and compatibility policy are prepared.
- [x] Define semantic versioning rules for syntax, runtime behavior, built-ins, modules, and bridges.
- [x] Define deprecation periods and migration-note requirements.
- [x] Mark experimental APIs and exclude them from the 1.0 compatibility promise.
- [~] Apache-2.0, owner/release authority Hamza Arya, and the npm/GitHub destinations are selected. Account permissions/publication must be verified; a stable contribution/governance process remains open.
- [~] SECURITY.md now names Hamza Arya, hamzaarya123@gmail.com, and best-effort active-preview handling without an invented SLA. Stable support lines and periods remain future qualification work.

### Distribution and compatibility

- [ ] Publish installation artifacts through the chosen channels.
- [ ] Verify every claimed operating system and architecture in clean environments.
- [ ] Verify minimum and current supported Node versions.
- [ ] Verify claimed Python versions for bridge examples.
- [ ] Run conformance, packaging, editor, CLI, module, mapping, and interop suites.
- [ ] Provide checksums and third-party notices.
- [ ] Document offline/local installation if it is supported.

### User readiness

- [ ] Tutorial and reference use only stable 1.0 behavior.
- [ ] A new user can build the reference project without repository knowledge.
- [ ] Runtime and compile failures point to actionable source locations.
- [ ] Upgrade instructions cover every supported pre-1.0 version.
- [x] Known limitations are specific and current.

### M9 definition of done

- [ ] All stability, distribution, compatibility, and user-readiness gates pass.
- [ ] No unresolved release-blocking issue remains in the decision or risk logs.
- [ ] Arya 1.0 artifacts and documentation are reproducible from the release revision.

---

## Cross-cutting test strategy

Use four layers rather than relying on one large integration suite:

| Layer | Purpose | Typical checks |
| --- | --- | --- |
| Compiler unit | Fast language contract | tokens, scopes, mappings, emitted specifiers |
| Generated-module integration | Runtime semantics | execution, stack frames, JS/Python behavior |
| CLI/package acceptance | Real distribution path | clean install, arguments, exit status, artifacts |
| AryaCode/LSP acceptance | User-facing editor path | diagnostics, mapped run output, containment, navigation |

Every new error assertion should prefer a stable error code or focused pattern over a complete message. Every path test should cover platform separators. Source columns must use the same UTF-16 convention as the LSP and current token offsets.

## Compatibility policy before 1.0

Until 1.0, behavior may change, but changes still require discipline:

- document the old and new behavior;
- explain why the change is worth its migration cost;
- add a test for the new contract;
- include a migration example in release notes;
- avoid silent semantic changes in patch releases;
- preserve generated-artifact compatibility only when explicitly promised.

## Risk register

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Direct string generation loses nested source positions | Incorrect stack locations | Use mapped fragments; move to a small AST if composition becomes fragile | Open |
| Source-map tests vary across Node versions | Brittle CI | Match stable frames; test minimum supported Node | Open |
| Name resolution breaks valid JS-global use | False diagnostics | Specify and test an explicit host-global surface first | Open |
| Module host-name declarations share injected runtime scope | Shadowed intrinsics can alter built-ins or trigger early TDZ | Document and test the current limit; evaluate runtime isolation without reserving otherwise legal names | Open |
| Module roots differ between CLI and AryaCode | Programs behave differently by runner | Define one project-boundary rule before M4 | Open |
| Partial graph build runs stale files | Incorrect execution | Stage graph output and publish only after all modules compile | Open |
| Python one-process-per-call is too slow | Poor performance | Teach batching in 0.2; evaluate persistent worker after user evidence | Open |
| Prerelease publication and stable qualification differ | An alpha could be mistaken for a fully qualified stable release | Apache-2.0 adopted; verify actual account permissions/publication, use npm next/GitHub prerelease, and retain platform/community limits | Public alpha operation pending; stable gates open |
| Product and language versions are confused | Support and upgrade errors | Label Arya and AryaCode versions separately everywhere | Open |
| 1.0 scope grows without evidence | Delayed stable release | Use M7 findings and M8 selection gate | Open |

## Decision log

Add decisions here as they are made. Link the relevant issue or commit when available.

| ID | Date | Decision | Reason | Affects |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11-08 | Keep JavaScript-compatible values as the default 0.2 direction | Preserves direct ecosystem interoperability and limits release scope | M2–M6 |
| D-002 | 2026-11-08 | Separate readable stack traces from interactive debugging | Source maps deliver immediate value without committing to a debugger architecture | M1 |
| D-003 | 2026-11-08 | Pin and bundle @jridgewell/gen-mapping 0.3.13 | Maintained standard v3 encoder; notices included | M1 |
| D-004 | 2026-11-09 | Preserve unary-before-power precedence: `-2 ** 2` is `4` | Keep 0.1 semantics; explicit grouping gives `-4`; conformance fixture locks the rule | M2 |
| D-005 | 2026-11-09 | Use the explicit Node-profile allowlist in specification section 7 and `src/host-globals.ts` | Resolver behavior must not depend on analysis-host globals; declarations may shadow host names; runtime isolation limitation is documented | M2–M3 |
| D-006 | 2026-11-09 | Approve relative `use arya "./file.arya" as name`, explicit extension, namespace-only live exports, entry directory as project root, canonical containment, and cycle rejection | A small deterministic graph contract shared by CLI and IDE; still unimplemented until M4 | M2, M4 |
| D-007 | 2026-11-09 | Preserve `namespace.default ?? namespace`; null/undefined defaults remain accessible as `alias.default` on the namespace | Avoid an interop migration; false/zero/empty defaults still select the default | M2, M5 |
| D-008 | 2026-11-09 | Adopt Apache-2.0, Copyright 2026 Hamza Arya, npm `arya-language`/`next`, GitHub `HamzaArya/arya-lang` prerelease, homepage/contact supplied by owner | Owner selected public alpha distribution; actual authentication/publication and stable qualification remain distinct gates | M6, M9 |
| D-009 | 2026-11-09 | Functions are hoisted within their lexical block; let/const and aliases have runtime TDZ; closures may refer to later bindings; loop header self-reference has TDZ | Preserve strict ES-module execution semantics; M3 resolves whole scopes and leaves known-name initialization timing to runtime | M2–M3 |
| D-010 | 2026-11-09 | `and`/`or` return operands; retain JS numeric edge values, reject nonfinite Python transport, document JSON negative-zero/large-integer behavior | Preserve runtime behavior and make bridge loss explicit; conformance tests cover each edge | M2, M5 |
| D-011 | 2026-11-09 | Parenthesize emitted numeric literals before property chaining | Fix accepted `1.toString()` and normalized decimal forms that previously emitted invalid JavaScript; existing grouped syntax remains valid | M2 |
| D-012 | 2026-11-09 | Record scope/declaration/reference facts during parsing; resolve the completed scope graph separately and share metadata with diagnostics/navigation | Preserve the mapped emitter, forward declarations, closures, and runtime TDZ without executing imports; all user-facing paths use one resolver | M3 |
| D-013 | 2026-11-09 | Report all independent semantic diagnostics after a complete parse; retain one syntax diagnostic until parser recovery is implemented | Better editor/CLI feedback while keeping recovery out of M3; preserve the first-error API alias and bump the local preview to alpha.2 | M3 |

| D-014 | 2026-11-10 | Adopt explicit input-first pipelines, concise/default/rest functions, iterable spreads, terminating guards, indexed iteration, and finally cleanup in 1.3.0-alpha.2 | Reduce wrappers and nesting while preserving method receivers, evaluation order, initializer environments, and explicit async behavior; the [flow contract](../flow-syntax.md) and conformance tests define the rules | Grammar, runtime, editor services, starter templates |
| D-015 | 2026-11-10 | Reserve guard as a binding word; keep at contextual and old source spellings accepted | A terminating guard has clear statement syntax; older guard bindings require the [documented rename](../flow-syntax.md#validate-assumptions-with-early-exits), while property keys remain legal | Prerelease migration |
| D-016 | 2026-11-10 | Add an input-first list library with exact-field selectors, nonmutating stable sorting, safe grouping, and explicit sync/async checks | Make routine application transformations short without silently treating promises as predicate results or modifying caller ordering | Standard library, member hints |

## Current workboard

### Now

- [~] Current compiler/CLI/package CI passes Linux/Windows/macOS on Node 22.15/24; qualify AryaCode/desktop paths on the remaining operating systems and architectures separately.

### Next

- [x] Local alpha.3 engineering, clean-snapshot/editor packaging, and graph desktop qualification are complete.
- [x] Owner selected Apache-2.0, Hamza Arya copyright/release authority, homepage/contact, npm `arya-language`/`next`, and the existing GitHub repository for an alpha prerelease.
- [x] Authenticate and publish reviewed alpha.3 to npm and the GitHub prerelease; actual links, source, artifact hash, and CI scope are recorded below. Learner review and broader desktop/architecture qualification remain open.

### Later

- [x] M5: interop edge cases, actionable codes, UTF-8 protocol, and batching/npm examples.
- [x] Owner supplied the public license, publishing destination/release authority, homepage, and private security contact; live publication is tracked separately.
- [ ] Complete remaining desktop/platform/architecture qualification and external learner sessions before closing final 0.2/stable 1.0 readiness.

## Progress notes

Add dated notes here when work changes direction, reveals a constraint, or closes a milestone. Routine commits do not need duplicate narration.

- **2026-11-08:** Roadmap created from the initial source-map-first plan and the Arya language audit. No implementation milestone has started yet.


- **2026-11-08:** Extracted the standalone repository and pinned archive integration in separate commits. Implemented source maps for the CLI and IDE runner as the first 0.2 preview feature. All remaining language milestones retain their completion tests above.

- **2026-11-08:** Extended M1 acceptance with real CLI Build/standalone execution, passive Check, syntax-failure preservation of code/map artifacts, and literal arguments including Node flags. `npm run check` passes all 16 tests on Node 22.15.0 and 24.16.0 on macOS arm64; clean-install acceptance and five AryaCode package/runner tests also pass on Node 22.15.0 with Python 3.13.15. Added Linux/Windows/macOS CI on Node 22.15.0 and 24, including packed installation and mapped traces. Linux/Windows results remain pending; no working local Docker daemon or remote CI run was available.

- **2026-11-09:** Completed M2's normative core, decisions D-004–D-007/D-009–D-011, and reference/tutorial/release updates. Added 14 core conformance tests plus two shipped CLI fixtures, bringing `npm run check` to 30 passing tests on Node 22.15.0 and 24.16.0 (macOS arm64, Python 3.13.15). Clean-installed package acceptance also passes, including both conformance fixtures. Fixed numeric property emission after a failing regression test; preserved all selected 0.1 semantic rules. Documented and tested the existing generated-runtime host-shadowing limitation. M3/M4's approved behavior remains explicitly unimplemented, and M1 Linux/Windows qualification remains pending.

- **2026-11-09:** Completed M3 in local preview `0.2.0-alpha.2`: source-positioned declaration/reference graph, deterministic lexical resolution, const/import/builtin write checks, conservative suggestions, all semantic diagnostics, and same-file definition lookup. All 43 language tests pass on Node 22.15.0 and 24.16.0 on macOS arm64; clean-installed package acceptance passes on both runtimes. AryaCode is repinned to the versioned archive; its 61-test suite and real desktop embedded/standalone-extension acceptance pass, including UTF-16 ranges, passive imports, semantic-error completion/Outline, navigation, diagnostic repair, mapped runtime errors, and Run/Stop. Updated the specification, tutorial, reference, API contract, editor guide, and migration notes. Known-name TDZ remains runtime behavior, parser recovery remains deferred, and M1 Linux/Windows qualification remains pending.

- **2026-11-09:** Owner requested completion of the remaining roadmap and selected public-release preparation, with license/destination to be supplied. Owner confirmed no Linux/Windows results or external learner feedback yet. Implemented alpha.3 module graphs and interop hardening, created the multi-file learning project, installation/compatibility/security/community/tooling-readiness materials, and a read-only release audit. Independent graph review found orphan-map data loss, missing constructor-export checks, FIFO blocking, and publication cleanup risks; regression tests and fixes were added. Unicode failed-call stderr now uses an exact byte bound after a reproducing test. M7 external observations, final M8 selection, and stable/public release qualification remain genuinely pending.

- **2026-11-09:** Alpha.3 local qualification passes 80 language tests on Node 22.15.0 and 24.16.0 with Python 3.13.15 (macOS arm64), 62 AryaCode tests, and both embedded/portable desktop acceptance suites. Real desktop Build/Run covers the shipped multi-file project; dependency Python selection, mapped failures, and stale-output prevention are tested. Clean snapshot/install/editor packaging is recorded separately by `npm run test:clean`; public/stable claims still require owner and external evidence.

- **2026-11-09:** The clean verifier completed fresh offline `npm ci`, all checks, VSIX/editor-kit packaging, installed lessons/examples/graph acceptance, and mechanical release audit in a retained source snapshot with a SHA-256 manifest. This is evidence for the recorded snapshot, not a fabricated clean Git commit. Public/stable readiness remains false pending the already-confirmed owner/platform/community gates.

- **2026-11-09:** Reproducibility review found current/file-time ZIP metadata and filesystem entry order in editor packaging. Added deterministic archive normalization with SOURCE_DATE_EPOCH, canonical modes, sorted entries, and timezone restoration; three focused tests pass on Node 22.15/24. Two actual identical-source builds now produce the same tarball, VSIX, and editor-kit hashes across timezones. The complete language/artifact suite contains 83 cases. Public/stable gates remain open.

- **2026-11-09:** Owner selected Apache-2.0, Copyright 2026 Hamza Arya, https://hamzaarya.com, private security contact hamzaarya123@gmail.com, public npm name `arya-language` with the `next` tag, and a GitHub prerelease in `HamzaArya/arya-lang`. CLI/language/repository names remain `arya`/Arya/`arya-lang`. Metadata and legal-file auditing distinguish mechanically prepared alpha packages from account authentication, actual publication, and stable qualification. Publication remains pending until live operations succeed; no Linux/Windows or learner evidence is inferred.

- **2026-11-09:** Read-only CI review found that earlier revision `6312372` passed Linux/macOS Node 22/24 jobs with 30 tests, while its Windows job failed on a Unicode Python path. Current M5 forces UTF-8 and includes local regressions, but alpha.3 has no completed cross-platform CI qualification yet; retain the current-candidate platform gate until fresh jobs run.

- **2026-11-09, post-publication documentation:** Published Apache-2.0 [`arya-language@0.2.0-alpha.3`](https://www.npmjs.com/package/arya-language/v/0.2.0-alpha.3) to npm after owner 2FA and created the [`v0.2.0-alpha.3` GitHub prerelease](https://github.com/HamzaArya/arya-lang/releases/tag/v0.2.0-alpha.3). Anonymous registry/version/tarball retrieval succeeded; published tarball SHA-256 is `3ab98fe2b8745051a9b451fd3c4311a7805238226dfa163df37997560b07744b`, matching the reviewed artifact. All eight GitHub assets were downloaded and matched. The immutable tag/source is `5a962385e1bdf35c8476748b992dc7efb0a01e2f`; this later documentation record does not alter its packaged preparation-state documents or retag the release. `next` and `latest` both resolve to this alpha; the authenticated `latest` removal request returned HTTP 400. A fresh credential-free `arya-language@next` install passed the installed CLI and multi-file Check/Run example. The version and GitHub release remain prerelease.
- **2026-11-09, current CI scope:** [Run 42566241620](https://github.com/HamzaArya/arya-lang/actions/runs/42566241620) passes all six Linux/Windows/macOS × Node 22.15/24 compiler/conformance/CLI/npm-pack/installed-acceptance jobs for the release source. Actual editor archive builds and embedded/portable desktop suites remain local macOS evidence. Public alpha publication does not close final 0.2/1.0, external-community/tooling, or untested desktop/architecture gates.

- **2026-11-10:** Published compiler and creator 1.2.0-alpha.4 on npm `latest`; public archive hashes and fresh-cache UI/desktop/editor-asset acceptance were verified. Current source-snapshot, browser/Electron/editor-host, minimum-Node, and native-bootstrap results are summarized in the release-readiness record. Refreshed repository guides and CI packaging; historical tags, artifacts, and evidence remain unchanged.
