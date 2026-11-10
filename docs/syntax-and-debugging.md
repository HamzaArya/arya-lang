# Safer expressions and easier debugging

The expression syntax and debugging tools below run on Node.js. They are available in the published 1.2.0-alpha.4 baseline and the Node.js-only 1.3.0-alpha.3 candidate.

The current source also adds [pipelines, concise functions, guards, indexed iteration, and finally](flow-syntax.md). Those new forms require the candidate compiler.

## Read missing data without losing valid values

```arya
keep settings = {retries: 0, enabled: false}

keep retries = settings?.retries ?? 3
keep enabled = settings?.enabled ?? true
keep title = settings?.page?.title ?? "Untitled"

say(retries, enabled, title)
```

This prints `0 false Untitled`. `left ?? right` evaluates the right side only if the left is `null` or `undefined`. Zero, false, empty text, and NaN are retained. The left side is evaluated once. `??` is left-associative and has lower precedence than `or`; all previous operator ranks remain unchanged. Thus `null ?? false or 7` means `null ?? (false or 7)`. Parentheses can make mixed logical expressions clearer. Generated JavaScript explicitly groups these expressions.

Optional operations support properties, indexes, and calls:

```arya
keep user = null
keep name = user?.profile?.name ?? "Guest"
keep first = user?.items?.[0]
keep callback = null
keep result = callback?.("hello") ?? "No callback"

say(name, first, result)
```

`?.` stops the remaining continuous chain when its operand is null or undefined, returning undefined. Skipped index expressions and call arguments are not evaluated. Methods keep their receiver, so `object.method?.(value)` still calls that object's method correctly. A non-null non-callable value still throws; exceptions from a getter/function are not swallowed. Names must still be declared and initialized before use. Optional access does not bypass Arya namespace-export checking.

Parentheses end the continuous short-circuit region: `user?.profile.name` skips the whole access if user is null, while `(user?.profile).name` performs a separate ordinary access and throws if the grouped result is undefined. Mark each potentially missing intermediate value explicitly, as in `user?.profile?.name`.

Optional chains are not assignment targets. Check the object with `if`, then use ordinary assignment. Optional constructor paths such as `new Factory?.Item()` and nullish assignment `??=` are not provided.

These expression features follow the documented JavaScript/Node semantics. Optional access does not inspect library APIs or add missing methods.

## Keep chains readable

```arya
keep result = ["Arya", "Python", "JavaScript"]
  .slice(1)
  .join(" + ")
  .toUpperCase()

say(result)
```

A leading `.` or `?.` continues the previous expression across newlines, blank lines, and comments. Calls/indexes inside that chain keep their existing evaluation order. A semicolon ends the expression. A newline after bare `return`/`give` still ends the return; the new chain syntax does not change that rule. An `await` still includes following property accesses in its operand: use `(await load()).value` when the property belongs to the resolved result.

## Diagnose before running

```sh
arya check main.arya
```

For a misspelled name, the CLI now produces a source excerpt:

```text
/project/main.arya:2:5: Unknown name 'totla'. Did you mean 'total'? [ARYA_UNKNOWN_NAME]
  2 | say(totla)
    |     ^^^^^
  help: Replace 'totla' with 'total', or declare the intended name.
```

Parser errors include targeted hints for common missing delimiters, initialization, and statement separators. Constant writes explain mutable bindings. Long excerpts are clipped around the failing token; tabs are expanded and terminal control characters escaped. File locations and machine-readable offsets retain the UTF-16 source convention. These excerpts cover compiler/project errors in `check`, `build`, and `run`; runtime failures retain their mapped runtime stacks.

VS Code and the LSP offer a Quick Fix when the current lexical analysis finds a unique spelling correction. They do not guess imports, rename unrelated references, or change a constant into a mutable binding. LSP edits carry the document version; stale diagnostic messages alone never authorize a repair. Ambiguous names and ordinary syntax errors do not get automatic edits.

For CI and other tools:

```sh
arya check main.arya --json
```

Success writes one JSON object to stdout with `ok:true`, `command`, `file`, `target`, and an empty `diagnostics` list. Failure returns exit status 1, `ok:false`, and structured diagnostics. Each source diagnostic includes file, code, message, one-based line/column, UTF-16 start/end offsets, optional hint/suggestion, and available fixes. Fix edits use zero-based UTF-16 offsets. Early invocation errors use `ARYA_CLI` and may omit source/target fields. JSON mode does not execute code, inspect dependency APIs, connect to services, or require a C compiler.

`--json` is a reporting option for `arya check`; it does not intercept a program's `--json` argument passed through `arya run`. These reporting features belong to the Node.js `arya` CLI.

## Inspect values and check assumptions

The JavaScript profile adds `use std "debug" as debug`:

```arya
use std "debug" as debug

keep totals = [10, 20, 30]
debug.assert(len(totals) > 0, "Expected at least one total.")

keep first = debug.trace("first total", totals[0])
say(debug.inspect({first: first, values: totals}))
```

| Helper | Behavior |
| --- | --- |
| `debug.assert(condition, message = "Assertion failed.")` | Return a truthy condition; otherwise throw `AryaAssertionError` with `code: "ARYA_ASSERTION"` at the caller. |
| `debug.inspect(value, options = {})` | Return an inspection string without invoking getters or custom inspection functions. |
| `debug.trace(label, value)` | Write the inspected value and actual caller location to stderr; return the value unchanged. |

Inspection options are `depth` (0–20, default 4), `maxArrayLength` (0–1000, default 50), and `colors` (boolean, default false). Long strings are limited to 10,000 characters by the inspector. Cyclic values can be inspected. Formatting follows the installed Node version and is not a serialization format. These explicit debugging helpers do not redact values; use structured logging's field redaction for application logs.

The CLI enables source maps automatically. When running generated JavaScript yourself, use `node --enable-source-maps output.mjs` and retain the adjacent map. Without source maps, trace locations refer to generated JavaScript. The debug library uses Node.js inspection and source maps.

The [safe-access fixture](../fixtures/arya/conformance/safe-access.arya) runs through Node.js conformance checks. The [debugging example](../fixtures/examples/debugging/main.arya) demonstrates the helpers.
