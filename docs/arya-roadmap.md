# Arya Roadmap: 0.2 to 1.0

**Status:** Living implementation plan  
**Created:** 8 November 2026  
**Current language version:** Arya 0.1.0  
**Related audit:** [Arya Language Logic Report](arya-language-logic-report.md)

## Purpose

This plan takes Arya from the current 0.1 prototype to a dependable 0.2 release, then toward a stable 1.0 language. It is written as a working document: tasks have IDs, dependencies, acceptance criteria, and checkboxes so progress and design decisions can be recorded here.

The first user-visible goal is deliberately narrow:

> A runtime failure must point to the original `.arya` file, line, and useful column through both the CLI and AryaCode.

Arya 0.2 then adds a written language contract, lexical name resolution, first-class Arya modules, stronger interoperability errors, and a clean installation path. Arya 1.0 adds the stability, learning material, platform verification, licensing, and compatibility policy expected of a language other people can build on.

## Product direction

Unless a later language decision explicitly changes it, Arya will keep JavaScript-compatible values and Node.js execution as its default direction. This preserves direct access to JavaScript and npm while Arya develops its own syntax, compiler checks, modules, tooling, and interoperability contracts.

The following work is outside the Arya 0.2 scope:

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
| M1 | Arya source maps and readable runtime traces | 0.2 | — | `[ ]` |
| M2 | Normative 0.2 language specification | 0.2 | M1 can proceed in parallel; must finish before release | `[ ]` |
| M3 | Lexical name resolution and stronger `check` | 0.2 | M2 scope decisions | `[ ]` |
| M4 | Arya-to-Arya modules and build graph | 0.2 | M1, M3 | `[ ]` |
| M5 | Interoperability hardening and examples | 0.2 | M2 | `[ ]` |
| M6 | Package, compatibility test, and release Arya 0.2 | 0.2 | M1–M5 | `[ ]` |
| M7 | Learning path and community review | pre-1.0 | M6 | `[ ]` |
| M8 | Tooling investments chosen from user evidence | pre-1.0 | M7 | `[ ]` |
| M9 | Specification, compatibility, and stable release | 1.0 | M7–M8 | `[ ]` |

---

## M1 · Arya source maps and readable runtime traces

### Outcome

Runtime stack traces identify the original Arya source location instead of only a generated `.mjs` location. This must work through `arya run`, AryaCode Run, and a built module launched with Node's source-map support enabled.

### M1.1 · Add the failing acceptance fixture

- [ ] Add `fixtures/arya/runtime-error.arya`:

  ```arya
  fn fail() {
    const item = null
    return item.name
  }
  fail()
  ```

- [ ] Add a CLI-level integration test that runs this source through the real Arya run path.
- [ ] Assert a nonzero exit status.
- [ ] Assert that stderr contains `TypeError`.
- [ ] Assert a mapped frame for `runtime-error.arya:3` and a caller frame for `runtime-error.arya:5`.
- [ ] Add the exact column assertion only after expression mappings exist. `name` begins at one-based column 15.
- [ ] Normalize path separators or match only stable path suffixes so the test runs on Windows, macOS, and Linux.

The first red test should require only correct lines. Column precision becomes a second red test, preventing the implementation from trying to solve every mapping detail at once.

### M1.2 · Define the compiler output contract

Extend the compile contract in [`packages/arya/src/compiler.ts`](../packages/arya/src/compiler.ts) so compilation receives the original source filename and intended generated filename, then returns source-map data with the generated code. The intended shape is conceptually:

```ts
interface CompileOptions {
  sourceFilename: string;
  generatedFilename: string;
}

interface Compilation {
  code: string;
  map: string;
  symbols: AryaSymbol[];
  usesPython: boolean;
}
```

The exact API can preserve a compatibility overload for existing callers. The important point is that the compiler must know the real output filename before it finalizes the map and `sourceMappingURL`; it must not guess `program.mjs` or a CLI-only name. Analysis callers may use a deterministic virtual generated filename because they do not write or execute the output.

These rules must hold:

- [ ] The compiler produces the map; CLI and AryaCode only write it.
- [ ] `compile()` remains side-effect free and never writes files.
- [ ] The map names the generated file and the original `.arya` source.
- [ ] The source path is relative to the map when practical and uses URL-style `/` separators.
- [ ] `sourcesContent` contains the Arya source so the map remains inspectable if generated output is moved.
- [ ] Injected runtime and Python bridge regions remain unmapped to Arya source. Their caller frames may map to Arya, but runtime implementation lines must not be falsely attributed to user code.
- [ ] Generated code ends with a relative `sourceMappingURL` comment.

Before adding a dependency, record the selected source-map encoder and why it was chosen in the decision log. Prefer a maintained encoder over a handwritten Base64 VLQ implementation.

### M1.3 · Preserve mappings while generating code

The current parser returns nested JavaScript strings before their final generated positions are known. Do not attempt to recover mappings by searching the final string: repeated identifiers and formatting changes make that unreliable.

Introduce a small source-preserving emission model. A practical first design is:

```ts
interface GeneratedFragment {
  text: string;
  mappings: RelativeMapping[];
}
```

Fragments carry mappings relative to their own generated text. Composition helpers wrap, join, and rebase fragments. The final emitter adds the runtime prefix and converts relative mappings to final generated positions.

- [ ] Add a generated-position tracker for line and UTF-16 column.
- [ ] Add helpers for literal generated text, token-origin text, joining fragments, and wrapping expressions.
- [ ] Change `Expression.code` into a source-preserving fragment.
- [ ] Preserve mappings when expressions are nested, wrapped in parentheses, or joined by generated operators.
- [ ] Preserve mappings when statements are placed inside blocks.
- [ ] Add statement mappings first, then expression mappings.

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

- [ ] Determine and validate the output path before compilation, then pass its generated filename into the compile contract.
- [ ] In [`packages/arya/src/cli.ts`](../packages/arya/src/cli.ts), write `<output>.map` beside the generated `.mjs` for both `build` and `run`.
- [ ] In [`packages/services/src/language-runner.ts`](../packages/services/src/language-runner.ts), write the map inside the same fingerprinted `.arya/run` directory as `program.mjs`.
- [ ] Apply existing `containedPath` checks separately to the map path in AryaCode.
- [ ] Write code and map only after compilation succeeds so a syntax failure cannot create a partially updated pair.
- [ ] Decide whether two-file replacement needs temporary files and rename. Record the decision; at minimum, never write a new module referring to a missing new map.
- [ ] Keep `.map` artifacts covered by the existing `.arya/build` and `.arya/run` ignores.

### M1.5 · Enable source maps in runners

- [ ] Change CLI execution to `node --enable-source-maps <generated.mjs> [...programArgs]`.
- [ ] Change AryaCode execution to put `--enable-source-maps` before the generated module path.
- [ ] Preserve all program arguments literally after the module path.
- [ ] Document standalone execution as `node --enable-source-maps path/to/program.mjs`.
- [ ] Verify behavior on the minimum supported Node version, not only the developer's current Node version.

Plain `node program.mjs` is not part of the mapped-stack acceptance contract unless supported Node versions enable source maps without a flag.

### M1.6 · Mapping acceptance matrix

Add focused fixtures or generated temporary sources for each case:

| Case | Required observation | Status |
| --- | --- | --- |
| Simple property access | failing line and property column map to `.arya` | `[ ]` |
| Caller frame | caller maps to the Arya call site | `[ ]` |
| Two expressions on one line | each failure can map to a distinct column | `[ ]` |
| Multiline expression | failing nested expression maps to its actual source line | `[ ]` |
| Failure after `await` | async stack contains the mapped Arya frame | `[ ]` |
| Path with spaces | original path is readable and correct | `[ ]` |
| Unicode before error | UTF-16 column agrees with LSP/editor positions | `[ ]` |
| Built-in failure | runtime frame may be generated; Arya caller is mapped | `[ ]` |
| Python bridge failure | bridge frame may be generated; Arya caller is mapped | `[ ]` |
| CLI run | mapped trace appears | `[ ]` |
| AryaCode run | mapped trace appears | `[ ]` |
| Standalone build | mapped trace appears with `--enable-source-maps` | `[ ]` |
| Existing JS import | imported-library frames are not falsely mapped to Arya | `[ ]` |

### M1 definition of done

- [ ] The acceptance fixture reports `runtime-error.arya:3:15` and a caller at line 5.
- [ ] All matrix cases above pass on supported test platforms.
- [ ] Generated runtime regions are not falsely mapped to the user source.
- [ ] `arya run`, AryaCode Run, and standalone mapped execution behave consistently.
- [ ] Existing tests pass.
- [ ] The language reference and tutorial no longer say runtime stacks point only to generated JavaScript.

---

## M2 · Normative Arya 0.2 language specification

### Outcome

Arya behavior is explicit enough that a program's result can be predicted without reading the compiler. The specification distinguishes required language behavior from Node implementation details and experimental behavior.

### Work

- [ ] Create `docs/arya-specification.md` with versioned status and terminology.
- [ ] Specify lexical grammar: identifiers, keywords, comments, strings, escapes, numbers, and limits.
- [ ] Specify statement grammar and newline/semicolon behavior.
- [ ] Specify operator precedence and associativity in one normative table.
- [ ] Specify scopes, shadowing, declarations, closures, and declaration timing.
- [ ] Specify JavaScript-compatible values, mutation, truthiness, equality, arithmetic, and conversions.
- [ ] Specify built-ins and exact error conditions.
- [ ] Specify host globals as an explicit compatibility surface rather than an accidental Node detail.
- [ ] Specify JavaScript imports, Arya imports, exports, and Python bridge behavior.
- [ ] Label implementation limits separately from semantic rules.
- [ ] Give every surprising rule a runnable example or conformance test.

### Required decisions

Record each answer in the decision log before M3 relies on it:

- [ ] Does `-2 ** 2` remain `4`, or change to the more common `-(2 ** 2)`, which is `-4`?
- [ ] Which Node/ECMAScript globals are guaranteed by Arya 0.2?
- [ ] Are function declarations visible throughout their scope?
- [ ] Is use before a `let`/`const` declaration a compiler error, a runtime error, or allowed when execution occurs later through a closure?
- [ ] Are `and` and `or` guaranteed to return operand values?
- [ ] How are `NaN`, infinity, and negative zero documented and transported across bridges?
- [ ] Is an intentional JavaScript default export of `null` allowed, and if so how is it distinguished from a namespace fallback?

### M2 definition of done

- [ ] The specification covers every construct accepted by the parser.
- [ ] Parser/runtime behavior and documentation agree.
- [ ] Every approved behavior change has a migration note and test.
- [ ] The language reference points to the specification without duplicating conflicting rules.

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

- [ ] Represent declaration kind: `let`, `const`, function, parameter, loop variable, catch variable, or import alias.
- [ ] Represent lexical references and assignment targets with source tokens.
- [ ] Build scopes in a pass that supports the M2 declaration-timing decisions.
- [ ] Resolve closures and legal nested shadowing.
- [ ] Diagnose unknown names with a precise range and, when reliable, a close-name suggestion.
- [ ] Diagnose direct and compound assignment to `const`.
- [ ] Include Arya built-ins and the approved host-global allowlist.
- [ ] Preserve non-executing analysis for missing JavaScript/Python packages.
- [ ] Return multiple independent diagnostics where parser recovery permits it; keep parser recovery itself outside M3 if it would delay the release.
- [ ] Reuse resolved symbols for go-to-definition if the core work makes it small and reliable. Do not make navigation a release blocker.

### Required tests

- [ ] misspelled local, parameter, import alias, and outer closure name;
- [ ] direct and compound write to `const`;
- [ ] valid nested shadowing;
- [ ] closure reading an outer binding;
- [ ] loop and catch variables inside and outside their scopes;
- [ ] properties that match no lexical name;
- [ ] approved host globals;
- [ ] duplicate declarations and parameters continue to fail;
- [ ] imports remain passive during analysis;
- [ ] diagnostics have correct UTF-16 ranges.

### M3 definition of done

- [ ] A misspelled variable fails `arya check` before execution.
- [ ] Assignment to `const` fails `arya check` before execution.
- [ ] Valid shadowing, recursion, closures, imports, and host globals pass.
- [ ] CLI, embedded AryaCode analysis, and portable LSP use the same resolver.
- [ ] Existing completion and Outline behavior does not regress.

---

## M4 · Arya-to-Arya modules and build graph

### Outcome

One entry command compiles and runs a multi-file Arya program. Every module receives its own source map, and a failure in a dependency points to that dependency's `.arya` source.

### Proposed 0.2 module surface

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

Confirm this syntax in M2 before implementation.

### Graph and output design

- [ ] Resolve every Arya import relative to its importing source file.
- [ ] Canonicalize file identities so aliases and symlinks do not compile the same module twice.
- [ ] In AryaCode, enforce workspace containment on every source and output.
- [ ] Define the CLI project boundary. Recommended 0.2 rule: the entry file's directory is the module root, and imports cannot escape it. If a broader project-root rule is chosen, specify it before coding.
- [ ] Build the dependency graph without executing modules.
- [ ] Produce deterministic topological order.
- [ ] Reject cycles with the complete shortest discovered chain, for example `a.arya → b.arya → a.arya`.
- [ ] Compile each source once per build.
- [ ] Mirror module paths under the generated output directory and rewrite Arya imports to generated relative `.mjs` specifiers.
- [ ] Emit a map beside every generated module.
- [ ] Prevent stale generated dependencies from being executed after any graph compile failure.

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

- [ ] entry imports and calls one dependency;
- [ ] transitive dependency;
- [ ] two modules share one dependency, compiled once;
- [ ] nested directories and `../` normalization within the project boundary;
- [ ] missing module with importer location;
- [ ] cycle with full import chain;
- [ ] dependency syntax failure with dependency source location;
- [ ] dependency runtime failure mapped to dependency `.arya` location;
- [ ] duplicate alias and symlink identity behavior;
- [ ] attempted workspace/project escape;
- [ ] JavaScript and Python imports continue to work inside dependencies;
- [ ] exports preserve live JavaScript module behavior as specified.

### M4 definition of done

- [ ] A multi-file program builds and runs with one command.
- [ ] CLI and AryaCode resolve the same graph for equivalent project boundaries.
- [ ] Source maps work for every module.
- [ ] Missing files, invalid exports, and cycles produce source-positioned diagnostics.
- [ ] A failed graph build cannot launch stale output.

---

## M5 · Interoperability hardening and examples

### Outcome

Common JavaScript and Python failures explain what happened, where it happened, and what the user can do. Published examples demonstrate efficient, supported patterns.

### Python bridge matrix

- [ ] missing Python executable;
- [ ] missing installed module;
- [ ] missing local `.py` file;
- [ ] private member access;
- [ ] `then` and `with` proxy-name limitations documented and tested;
- [ ] unsupported input: function, symbol, bigint, `undefined`, non-finite number, and cyclic object;
- [ ] unsupported Python return value;
- [ ] Python exception type and message;
- [ ] worker timeout;
- [ ] oversized stdout/stderr/response;
- [ ] malformed or truncated protocol response;
- [ ] Python logging forwarded without corrupting the response;
- [ ] path with spaces and Unicode;
- [ ] batch processing in one call.

### JavaScript interop matrix

- [ ] namespace-only ES module;
- [ ] ordinary default export;
- [ ] intentional `null`/`undefined` default behavior from M2;
- [ ] CommonJS package;
- [ ] callback and method receiver preservation;
- [ ] constructor and async function;
- [ ] missing package and missing export behavior;
- [ ] mapped Arya caller frame when library code throws.

### Examples and messages

- [ ] Add one small npm project example with explicit installation steps.
- [ ] Add one Python batch example that avoids a process launch inside an Arya loop.
- [ ] Give bridge errors stable Arya-facing prefixes or codes where that improves supportability.
- [ ] Keep underlying exceptions useful without exposing an uncontrolled traceback as structured protocol data.
- [ ] Update tutorial troubleshooting for interpreter selection, JSON limits, timeouts, and batching.

### M5 definition of done

- [ ] Every matrix case has a test or an explicit documented limitation.
- [ ] Common bridge failures give actionable messages.
- [ ] A new user can run both examples from the published instructions.
- [ ] Interop errors retain mapped Arya caller frames.

---

## M6 · Package and release Arya 0.2

### Outcome

Arya 0.2 is installable and testable independently of the repository checkout.

### Release gates

- [ ] Settle the license and distribution terms. Public distribution is blocked while the package remains `UNLICENSED` and private unless that is an intentional private-release policy.
- [ ] Update `ARYA_VERSION`, extension version, documentation, and package metadata together.
- [ ] Keep Arya language version 0.2 separate from the AryaCode product version in all UI and release text.
- [ ] Publish supported Node versions and the Python versions/platforms actually tested.
- [ ] Document installation, upgrade, uninstall, and local-project use.
- [ ] Write release notes with behavior changes and migration guidance.
- [ ] Build the tarball and editor artifacts from a clean checkout.
- [ ] Install the tarball into a temporary project with no repository-relative dependency access.
- [ ] Run `arya --version`, `check`, `build`, and `run` from that clean install.
- [ ] Run the multi-file example and intentional runtime-error example.
- [ ] Verify packaged maps contain correct sources and no accidental repository-only paths.
- [ ] Verify the portable LSP and editor extension still match compiler 0.2 semantics.
- [ ] Run the supported-platform test matrix before making platform claims.

### M6 definition of done

- [ ] All M1–M5 definitions of done are satisfied.
- [ ] `npm run check` passes from a clean dependency install.
- [ ] Clean-install acceptance passes without the source repository.
- [ ] Release artifacts, checksums, notices, license, and version labels are complete.
- [ ] Arya 0.2 release notes link to the versioned specification and tutorial.

---

## M7 · Learning path and community review

### Outcome

People who did not build Arya can learn it, complete a small project, and report where the experience breaks down.

### Work

- [ ] Write a short learning path that starts with one file and ends with a multi-file project using one interop feature.
- [ ] Include exercises, expected output, common errors, and a completed reference project.
- [ ] Test every command in the tutorial from a clean install.
- [ ] Recruit a small group of learners and developers who were not involved in implementation.
- [ ] Include Afghan programmers and learners where possible so Arya's intended identity is reflected by real participation.
- [ ] Observe installation, first run, rule comprehension, error diagnosis, modules, and interop.
- [ ] Record issues without coaching users past them unless they are blocked.
- [ ] Rank findings by frequency, severity, and whether the problem is language, tooling, documentation, or packaging.

### Language and identity notes

Dari and Pashto learning material would strengthen Arya's Afghan identity when fluent reviewers can verify it. Translation is a documentation project. Allowing identifiers in Arabic-derived scripts is a separate language feature requiring lexer, source-position, normalization, editor, font, bidirectional-text, and diagnostic testing. Do not combine those scopes accidentally.

Before using “the first Afghan programming language” publicly, define the qualification criteria and conduct a separate historical review. The code audit establishes Arya's implementation; it does not prove historical priority.

### M7 definition of done

- [ ] At least one complete beginner path works from clean installation.
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

- [ ] Selected tooling work traces back to M7 evidence or a release-critical engineering risk.
- [ ] Each selected item has its own acceptance criteria and compatibility assessment.
- [ ] Deferred items remain visible in the backlog without blocking 1.0.

---

## M9 · Arya 1.0 stable release

### Outcome

Arya has a documented stable core that users can install, learn, use for small real projects, and upgrade with clear expectations.

### Stability and governance

- [ ] Publish the Arya 1.0 specification.
- [ ] Define semantic versioning rules for syntax, runtime behavior, built-ins, modules, and bridges.
- [ ] Define deprecation periods and migration-note requirements.
- [ ] Mark experimental APIs and exclude them from the 1.0 compatibility promise.
- [ ] Settle license, contribution terms, package ownership, and release authority.
- [ ] Define a security-reporting path and supported-release policy.

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
- [ ] Known limitations are specific and current.

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
| Module roots differ between CLI and AryaCode | Programs behave differently by runner | Define one project-boundary rule before M4 | Open |
| Partial graph build runs stale files | Incorrect execution | Stage graph output and publish only after all modules compile | Open |
| Python one-process-per-call is too slow | Poor performance | Teach batching in 0.2; evaluate persistent worker after user evidence | Open |
| Public release blocked by licensing | Cannot distribute clearly | Resolve license and package policy before M6 | Open |
| Product and language versions are confused | Support and upgrade errors | Label Arya and AryaCode versions separately everywhere | Open |
| 1.0 scope grows without evidence | Delayed stable release | Use M7 findings and M8 selection gate | Open |

## Decision log

Add decisions here as they are made. Link the relevant issue or commit when available.

| ID | Date | Decision | Reason | Affects |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11-08 | Keep JavaScript-compatible values as the default 0.2 direction | Preserves direct ecosystem interoperability and limits release scope | M2–M6 |
| D-002 | 2026-11-08 | Separate readable stack traces from interactive debugging | Source maps deliver immediate value without committing to a debugger architecture | M1 |
| D-003 | — | Source-map encoder | Pending | M1 |
| D-004 | — | Unary minus versus exponentiation semantics | Pending | M2 |
| D-005 | — | Guaranteed host globals | Pending | M2–M3 |
| D-006 | — | Arya module syntax and project boundary | Pending | M2, M4 |
| D-007 | — | JavaScript `null` default export behavior | Pending | M2, M5 |
| D-008 | — | License and public distribution policy | Pending | M6, M9 |

## Current workboard

Keep this section short. Move completed details into milestone checklists and select the next smallest verifiable slice.

### Now

- [ ] M1.1: add the failing runtime-error fixture and line-level CLI acceptance test.
- [ ] M1.2: choose the source-map encoder and finalize the `Compilation` map contract.

### Next

- [ ] M1.3: build the mapped-fragment emitter and reach statement-level mapping.
- [ ] M1.3: add expression mappings for property access and calls.
- [ ] M1.4–M1.5: write map artifacts and enable them in both runners.

### Later

- [ ] Complete the M1 acceptance matrix.
- [ ] Start M2 specification decisions while M1 edge cases are being tested.

## Progress notes

Add dated notes here when work changes direction, reveals a constraint, or closes a milestone. Routine commits do not need duplicate narration.

- **2026-11-08:** Roadmap created from the initial source-map-first plan and the Arya language audit. No implementation milestone has started yet.

