# Arya Language Logic Report

> Historical audit of Arya 0.1.0 at the revision below. Findings describe that snapshot, not the current compiler. Links to extracted language files now use their repository destinations; IDE ownership is described in the [extraction inventory](repository-extraction.md). Start at the [current documentation](README.md) for 1.2.0-alpha.4.

**Audit date:** 8 November 2026  
**Language version:** Arya 0.1.0  
**Repository revision:** `15a7955` on `main`  
**Scope:** compiler, runtime, CLI, editor services, language documentation, fixtures, and automated tests

## Executive conclusion

Arya is a real programming language with its own front end and language design. It has an independent lexer, parser, grammar, statement rules, operator precedence table, declaration checks, built-ins, import syntax, diagnostics, and JavaScript/Python interoperability contract. A `.arya` file is not JavaScript with a different extension: JavaScript cannot directly parse Arya constructs such as `fn`, `and`, `for item in values`, or `use python`.

Arya 0.1 is also intentionally a JavaScript-hosted language. Its compiler translates Arya directly into JavaScript ES modules, and Node.js executes the generated module. Numbers, strings, truthiness, object identity, list behavior, arithmetic edge cases, promises, and most runtime errors consequently follow JavaScript semantics. The Python path is a synchronous JSON bridge launched from that JavaScript runtime.

The most precise classification is:

> **Arya is an independent source language and transpiler with a small Arya runtime, using JavaScript as its current semantic and execution substrate.**

It is more than a syntax theme or macro set, but it does not yet have an independent virtual machine, native backend, type system, package system, or fully distinct value model.

## What “its own logic” means

There are several layers of logic in a programming language. Arya owns some layers and inherits others.

| Layer | Current owner | Evidence and consequence |
| --- | --- | --- |
| Source syntax | Arya | Arya defines its own keywords, comments, declarations, functions, loops, imports, and statement separators. |
| Tokenization | Arya | The lexer recognizes Arya words, numbers, strings, symbols, newlines, and source limits. |
| Parsing | Arya | A hand-written parser decides which programs are valid and emits targeted Arya errors. |
| Operator grammar | Arya | Arya defines precedence, associativity, and spellings such as `and`, `or`, and `not`. |
| Basic static rules | Arya | Duplicate declarations, duplicate parameters, invalid `return`/`break`/`continue`, misplaced exports/imports, and invalid `await` are rejected. |
| Built-ins | Arya | `print`, `len`, `range`, `str`, `number`, and `args` are injected by the Arya runtime. |
| Module/bridge syntax | Arya | `use js`, `use python`, `export`, and Python keyword-call `.with(...)` are Arya contracts. |
| Value model | JavaScript | Values are JavaScript numbers, strings, arrays, objects, functions, promises, and `null`. |
| Truth and equality | JavaScript, selected by Arya | Conditions use JavaScript truthiness; Arya `==`/`!=` deliberately become JavaScript `===`/`!==`. |
| Execution engine | Node.js | Generated `.mjs` modules run in Node; standard Node globals remain visible. |
| Python execution | Python through Arya bridge | Each call starts Python, transports JSON, invokes a public member, and returns JSON. |

This split is a legitimate language architecture. TypeScript, CoffeeScript, ClojureScript, and many domain languages also establish their own source language while targeting an existing runtime. Arya becomes more semantically independent only when it defines behavior that differs from its target and implements that behavior itself.

## Implementation architecture

The current execution path is:

```text
main.arya
   │
   ▼
Arya tokenizer
   │ tokens with offsets, line, and column
   ▼
Arya recursive-descent parser
   │ syntax checks + direct JavaScript generation
   ▼
generated program.mjs
   │ Arya built-ins + optional Python bridge + program body
   ▼
Node.js
   ├── JavaScript / npm / Node modules
   └── Python child process per bridge call
```

The core is deliberately small: the compiler, runtime, CLI, language service, and LSP total 493 lines at this revision. The compiler is a direct source-to-source translator rather than a traditional multi-stage compiler. It does not build a durable abstract syntax tree or intermediate representation; parser methods return JavaScript strings as they recognize Arya constructs.

Main components:

- [`packages/arya/src/compiler.ts`](../src/compiler.ts) contains tokenization, parsing, static syntax checks, symbol collection, and JavaScript generation.
- [`packages/arya/src/runtime.ts`](../src/runtime.ts) defines Arya built-ins and the Python JSON bridge embedded in generated modules.
- [`packages/arya/src/cli.ts`](../src/cli.ts) implements `run`, `check`, and `build`.
- [`packages/arya/src/language-service.ts`](../src/language-service.ts) exposes parse analysis, completion data, and built-in hover information.
- [`packages/arya/src/lsp.ts`](../src/lsp.ts) provides portable diagnostics, completion, hover, and document symbols over LSP.
- [`packages/services/src/language-runner.ts`](repository-extraction.md) integrates compilation and execution with AryaCode workspace trust, tool selection, and output containment.

## Lexical rules owned by Arya

Arya's tokenizer makes the first independent language decisions:

- Names use ASCII letters, digits, and underscores, and cannot begin with a digit.
- Names beginning with `__arya` are reserved for compiler internals.
- Arya keywords and JavaScript-reserved words cannot be used as declaration names.
- Both `#` and `//` introduce line comments.
- Newlines are tokens because they can terminate statements.
- Single- and double-quoted strings are supported.
- String escapes are limited to `\n`, `\r`, `\t`, `\\`, escaped single quote, and escaped double quote.
- Decimal and exponent number forms are supported; hexadecimal, binary, numeric separators, `.5`, and `1.` are not part of the grammar.
- Two-character operators include `==`, `!=`, `<=`, `>=`, compound arithmetic assignments, and `**`.
- A source file is limited to 256 KiB and 50,000 tokens.
- Parser nesting is limited to 100 nested operations/blocks.

These are Arya rules even where the resulting literal later becomes a JavaScript value.

## Grammar and control-flow logic

Arya currently defines these declaration and statement forms:

- `let` and `const` bindings with required initializers
- named and anonymous `fn` functions
- named and anonymous `async fn` functions
- `return`
- `if`, `else if`, and `else`
- `for name in iterable`
- `while`
- `break` and `continue`
- `try`, `catch`, and `throw`
- `use js` and `use python`
- top-level `export` on variables and functions
- ordinary expression and assignment statements

The parser enforces context-sensitive rules. `return` is accepted only inside a function; loop control only inside a loop; `await` only at module level or inside an async function; imports only at the top level; and exports only for top-level variables or functions. Function parameters and declarations cannot duplicate a name in the same Arya scope. Nested scopes may shadow outer names.

Arya supports expressions for literals, lists, objects, function values, calls, member access, indexing, constructors, unary operators, binary operators, and grouping. Assignment is a statement rather than a general expression. Assignable targets are names, properties, and indexed values.

Notable exclusions in version 0.1 include classes, destructuring, spread/rest syntax, default parameters, optional chaining, nullish coalescing, ternary expressions, template strings, switch statements, generators, and assignment expressions.

## Operator logic

Arya owns the operator precedence and association rules below, from lowest to highest:

| Precedence | Operators | Association/translation |
| ---: | --- | --- |
| 1 | `or` | left-associative; emits `||` |
| 2 | `and` | left-associative; emits `&&` |
| 3 | `==`, `!=` | left-associative; emit `===`, `!==` |
| 4 | `<`, `<=`, `>`, `>=` | left-associative |
| 5 | `+`, `-` | left-associative |
| 6 | `*`, `/`, `%` | left-associative |
| 7 | `**` | right-associative |
| unary | `not`, `!`, `+`, `-`, `await` | parsed before binary operators |

Two design details are distinctly Arya:

1. `==` looks like loose equality in JavaScript but Arya defines it as strict equality.
2. Unary operators bind before exponentiation, so `-2 ** 2` means `(-2) ** 2`, producing `4`. JavaScript requires parentheses for that interpretation.

The results still use JavaScript values. `and` and `or` short-circuit and return an operand rather than coercing the result to a Boolean. `+` performs JavaScript numeric addition or string concatenation. Division by zero, `NaN`, floating-point precision, and coercion behavior come from JavaScript.

## Scope and name logic

The compiler maintains a stack of scope name sets. This provides useful early checks but is not full name resolution.

What is checked during compilation:

- a name cannot be declared twice in one scope;
- function parameters cannot repeat;
- built-in names cannot be redeclared at top level;
- nested blocks and functions may shadow an outer name;
- compiler-reserved and JavaScript-reserved names cannot be declarations;
- top-level symbols are collected for editor completion and Outline.

What is deferred to JavaScript/Node:

- whether a referenced name exists;
- reassignment of a `const` binding;
- use before initialization;
- property and method existence;
- function arity;
- value and parameter types;
- whether a value is iterable, callable, or constructible.

Consequently, `arya check` is a syntax and structural-context check. It is not a type checker or a complete semantic verifier. A program can pass `check` and fail when Node executes it.

## Runtime value model

Arya does not currently wrap ordinary values. This is valuable for JavaScript interoperability and also defines the language's present semantic dependence.

| Arya source concept | Runtime representation |
| --- | --- |
| Number | JavaScript IEEE-754 double |
| String | JavaScript UTF-16 string |
| Boolean | JavaScript Boolean |
| `null` | JavaScript `null` |
| List | JavaScript `Array` |
| Object | JavaScript object |
| Function | JavaScript function |
| Async function | JavaScript async function / `Promise` result |
| Error | JavaScript `Error` or bridged Python error wrapped as `Error` |

Conditions accept any value and use JavaScript truthiness. Objects and lists retain identity and mutability. `const` protects the binding, not the contents of an object. Object literal keys are emitted as computed string keys, which safely preserves a literal key such as `"__proto__"` as ordinary data.

Standard Node globals including `JSON`, `Math`, `Date`, `Promise`, `fetch`, and `process` are available without an Arya declaration. This is convenient but makes the current global environment part of the effective language surface.

## Arya built-ins

The runtime injects six names into every generated module:

| Built-in | Defined behavior |
| --- | --- |
| `print(...values)` | Delegates to `console.log`. |
| `len(value)` | Accepts only a string or list; otherwise throws `TypeError`. |
| `range(end)` | Produces integers from zero up to, excluding, `end`. |
| `range(start, end, step)` | Produces an end-exclusive integer list for positive or negative nonzero steps. |
| `str(value)` | Delegates to JavaScript `String(value)`. |
| `number(value)` | Delegates to JavaScript `Number(value)`. |
| `args` | Contains process arguments after the generated module path. |

`range` requires safe integers, rejects a zero step, and caps output at 100,000 elements. These validation and limit choices are Arya-specific runtime logic.

## JavaScript interoperability

`use js "specifier" as name` becomes a static ES-module namespace import. Relative and absolute paths are resolved relative to the original `.arya` source; bare package and `node:` specifiers are preserved for Node resolution.

The bound value is `namespace.default ?? namespace`. This makes CommonJS/default-style packages easy to call, while namespace-only modules remain available as objects. One edge case is that a module whose intentional default export is `null` or `undefined` falls back to its namespace.

Interoperability is direct:

- Arya functions can be passed as JavaScript callbacks.
- JavaScript method receivers are preserved by generated property-call syntax.
- constructors are available through `new library.Constructor(...)`.
- promises work with `await`.
- ES modules, CommonJS packages exposed through Node's ESM loader, and Node built-ins are covered by tests.

Arya exports become normal ES-module exports. There is no automatic source-level Arya module build graph yet; a second Arya file must currently consume already-generated JavaScript or use an external build step.

## Python bridge logic

`use python "module" as name` creates a lazy proxy. Accessing public properties records a member path, and calling the proxy sends that path and arguments to a fresh Python process.

Each call performs these steps:

1. Serialize the module name, member path, positional arguments, and keyword arguments as JSON.
2. Start the selected Python executable with an in-memory worker script; no shell is used.
3. Import an installed module or load a source-relative/absolute `.py` file.
4. Reject member path segments beginning with `_`.
5. Call the selected Python object.
6. Serialize a success value or exception description back to JSON.
7. Convert a Python failure into a catchable JavaScript/Arya `Error`.

The bridge accepts JSON-compatible strings, finite numbers, booleans, nulls, lists, and objects. JavaScript functions, symbols, big integers, `undefined`, non-finite numbers, callbacks, and Python object identity cannot cross it. `.with([positional], {keyword: value})` supplies Python keyword arguments.

Operational limits are significant:

- calls are synchronous from Arya's point of view;
- every call launches a new Python process;
- state does not persist between calls;
- each call has a 30-second timeout and 8 MiB buffer;
- library stdout is redirected to Arya's stderr so protocol stdout remains valid JSON;
- proxy names `then` and `with` have bridge behavior and cannot represent ordinary Python members with those names;
- private members beginning with `_` are intentionally inaccessible.

This is genuine Arya integration logic, although function execution itself remains Python behavior.

## Build and execution behavior

The CLI exposes:

- `arya check file.arya`: tokenize and parse without executing imports or program code;
- `arya build file.arya`: generate an ES module under `.arya/build` beside the source;
- `arya run file.arya`: build and launch the generated module with Node.

AryaCode follows a similar path but writes fingerprinted output under `.arya/run`. It requires workspace trust, confines source and generated output paths to the workspace, selects configured Node/Python tools, prefers project virtual environments for Python, preserves program arguments, and refuses Arya source-level debugging because source maps and an Arya debugger are not implemented.

Generated modules contain the entire small JavaScript runtime. The Python bridge is included only when the parser encounters `use python`, keeping ordinary output smaller and removing the child-process import from JavaScript-only programs.

## Editor intelligence

Arya has both an embedded AryaCode language service and a portable LSP server. They parse text without resolving or executing imports.

Current features:

- syntax highlighting and snippets;
- one live syntax diagnostic at a time;
- keyword, built-in, and top-level-symbol completion;
- built-in hover documentation;
- top-level function, variable, and module symbols in Outline;
- UTF-16-compatible LSP positions and incremental document synchronization.

Current limitations:

- no type inference or type diagnostics;
- no go-to-definition, references, rename, signature help, or semantic tokens;
- no imported-library API completion;
- no formatter;
- no recovery after a parse error, so analysis returns no symbols when the file is syntactically invalid;
- no multi-error reporting;
- no source-level debugger.

## Verification status

The focused automated suite contains 11 top-level tests across 228 lines, in addition to workbench integration coverage. It verifies:

- values, precedence, recursion, closures, loops, mutation, and control flow;
- JavaScript callbacks, receiver preservation, constructors, async behavior, ESM, and CommonJS;
- Python modules, local files, nested JSON, keyword arguments, stdout handling, and exceptions;
- source-positioned diagnostics and invalid-context rejection;
- strings, comments, multiline collections, `else if`, and exports;
- workspace tool selection, arguments, non-executing builds, trust, and syntax-failure behavior;
- containment of generated output against symlink escape;
- syntactic validity of generated JavaScript for the four top-level shipped examples;
- TextMate token scopes;
- safe hover behavior;
- LSP edits, Unicode positions, completion, hover, Outline, lifecycle, and non-execution of imported code.

The test suite is meaningful for the current architecture. Its strongest property is that it checks observable execution and bridge behavior rather than only comparing generated strings.

For this audit, `npm run check` completed successfully with TypeScript type checking and all **67 repository tests passing** on Node.js 24.16.0 and Python 3.13.15. No test was skipped or failed.

Coverage that would strengthen the language contract includes:

- a table-driven test for every operator and precedence boundary;
- negative-step and invalid-input `range` tests;
- explicit truthiness, `NaN`, infinity, negative zero, and floating-point behavior tests;
- scope-shadowing and use-before-declaration cases;
- all string escape and numeric literal boundaries;
- JavaScript modules with `null` or `undefined` default exports;
- Python timeout, oversized output, missing interpreter, non-serializable return value, and inaccessible-member cases;
- CLI end-to-end tests for `check`, `build`, signal forwarding, and exit codes;
- golden tests for diagnostic messages and generated source locations.

## Design strengths

1. **Clear, teachable surface.** The language offers a small set of familiar constructs with readable spellings.
2. **Real parser ownership.** Arya controls validity and can evolve independently of JavaScript syntax.
3. **Pragmatic interoperability.** Direct JavaScript values make npm and Node integration inexpensive and reliable.
4. **Useful Python access without an SDK.** Ordinary Python modules can participate through a narrow, documented JSON contract.
5. **Non-executing analysis.** Syntax checks and editor diagnostics do not import dependencies or run user code.
6. **Defensive prototype limits.** Source, token, nesting, range, subprocess time, and buffer bounds reduce accidental resource exhaustion.
7. **Workspace controls.** Trust checks and contained output paths are integrated into AryaCode execution.
8. **Focused tests.** Core runtime behavior and both ecosystem bridges have integration coverage.

## Technical constraints and risks

### 1. Direct code generation limits language evolution

The parser emits JavaScript strings immediately. This is compact, but an AST or intermediate representation will become important for source maps, formatting, richer diagnostics, static analysis, multiple backends, optimizations, and reliable transformations.

### 2. The semantic contract is partly implicit

Many behaviors are documented as “JavaScript semantics,” which is accurate but broad. A stable language specification should explicitly settle coercion, truthiness, equality, integer expectations, `NaN`, infinity, negative zero, object key order, mutation, exception behavior, and host-global availability. Otherwise a future non-JavaScript backend will have no precise compatibility target.

### 3. Syntax checking can be mistaken for semantic checking

The compiler does not resolve names or types. Missing names, invalid calls, const reassignment, bad property access, and many invalid runtime operations pass `arya check`. The command output correctly says `Syntax OK`, but user-facing documentation should consistently preserve that distinction.

### 4. Generated errors do not map back to Arya

Without source maps, runtime stack traces point into generated `.mjs` files and include injected runtime lines. This will become painful as programs grow and is the highest-impact tooling gap for everyday use.

### 5. Python calls have high per-call cost

A new synchronous process for each call is simple and isolated but unsuitable for tight loops, stateful libraries, GUI/event-loop integrations, large data, or latency-sensitive applications. Batching helps but does not replace a persistent bridge protocol.

### 6. Host globals enlarge the language surface accidentally

Any Node global can appear in Arya code without an import or declaration. That is useful today, but it couples programs to the selected Node version and makes a browser or alternative runtime backend harder to specify.

### 7. Version identities can be confused

The Arya language/compiler is 0.1.0 while the AryaCode product is 1.1.0. Both are valid, but release material should always label them explicitly as “Arya language version” and “AryaCode product version.”

### 8. Packaging remains private and unlicensed for distribution

The generated `arya-lang` package is marked `private: true` and `UNLICENSED`. That matches the current repository policy but means public package distribution and third-party contribution/use expectations are not yet settled.

## Recommended roadmap

### Priority 1: freeze the language contract

Write a short normative specification derived from the current parser and runtime. Define grammar, precedence, scope, values, truthiness, equality, conversions, errors, built-ins, host globals, module behavior, and bridge guarantees. Add conformance tests beside each rule. This preserves intentional behavior before implementation changes make it harder to distinguish design from accident.

### Priority 2: introduce an AST with source spans

Separate parsing from JavaScript emission. Every AST node should retain source offsets. Keep the existing JavaScript backend initially so behavior stays stable. This creates the foundation for source maps, multiple diagnostics, formatting, semantic analysis, and future backends.

### Priority 3: add source maps and Arya stack traces

Emit source maps for generated modules and ensure Node loads them. Map compiler/runtime errors to `.arya` lines and columns. This provides more immediate user value than a large syntax expansion.

### Priority 4: add name resolution before a type system

Build lexical symbol tables that resolve declarations and references. Diagnose unknown names, use-before-initialization, const assignment, and invalid export/import placement. This catches common mistakes without committing to a full static type design.

### Priority 5: define modules as an Arya feature

Add first-class Arya-to-Arya imports and a build graph, including cycle behavior, output layout, caching, and incremental rebuilding. Users should not need to manually compile one Arya source into `.mjs` before another can consume it.

### Priority 6: evolve the Python bridge

Design a persistent worker option with request IDs, cancellation, explicit lifecycle, structured error data, configurable limits, and an async Arya API. Retain the current one-shot mode as a simple isolation option.

### Priority 7: choose the long-term semantic direction

Make an explicit product decision between:

- **JavaScript-compatible Arya:** standardize JavaScript values and semantics as part of Arya, optimizing for ecosystem access; or
- **independent Arya semantics:** define an Arya value model and implement compatibility adapters at JavaScript/Python boundaries.

Both paths are valid. The first is much cheaper and fits the current promise of connected ecosystems. The second offers deeper language identity but requires a runtime layer, more conversion rules, and substantially more conformance work.

## Final assessment

Arya 0.1 already has its own language logic where a young language most needs it: syntax, grammar, control structures, precedence, compile-time structural rules, built-ins, imports, diagnostics, and interoperability design. The implementation is coherent with its documentation and backed by execution-level tests.

Its current identity is intentionally hybrid. Arya decides **how programmers write and structure programs**, while JavaScript and Node decide **how most values behave and how the program executes**. Python is connected through an Arya-defined transport rather than incorporated into the core value model.

The language is therefore credible as an experimental transpiled language. Its next step toward maturity is not adding many more keywords. The strongest path is to formalize the current semantics, introduce an AST and source maps, then add name resolution and first-class Arya modules. Those changes will make Arya's existing logic precise, debuggable, and extensible while preserving its strongest feature: direct access to established ecosystems.

