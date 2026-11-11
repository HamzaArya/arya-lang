# Readable application syntax

**Added in 1.3.0-alpha.2; included in published 1.3.0-alpha.7 and the unpublished 1.3.0-alpha.9 candidate.** Install the published preview with an exact alpha.7 pin, or follow [candidate setup](node-runtime.md#try-the-candidate) for unreleased fixes. The older 1.2 release on `latest` does not include these forms.

Use `const` for an immutable binding, `let` for a mutable binding, `fn` for a function, `for` for iteration, and `print` for output. Block-bodied functions remain available alongside concise functions. The current candidate uses one set of spellings; see [syntax migration](syntax-migration.md) for the breaking alias removal in alpha.4.

## Transform data from top to bottom

```arya
use std "list" as list

const people = [
  {name: "Hamza", active: true, score: 85},
  {name: "Samira", active: true, score: 95},
  {name: "Inactive", active: false, score: 100}
]

const leaders = people
  |> list.filter("active")
  |> list.sortBy("score", "desc")
  |> list.take(3)

for person at position in leaders {
  print(position + 1, person.name)
}
```

`value |> transform` calls `transform(value)`. `value |> transform(extra)` supplies `value` as the first argument, followed by the explicit arguments. A pipeline evaluates input once, then its function/receiver/key/getter, then explicit arguments, and finally invokes the stage. Method receivers are retained; callbacks do not need `.bind` wrappers.

Pipelines associate left to right and have lower precedence than `??` and the ordinary operators. Parenthesize mixtures when the intended grouping would be unclear. A leading `|>` can continue an expression across newlines/comments. Semicolons end that continuation.

Stages use function names, ordinary member access/calls, or parenthesized inline functions: `21 |> (fn(value) => value * 2)`. Optional-chain stage targets are rejected; select an available function before entering the pipeline. Pipelines return each stage's actual result and do not automatically await promises.

## Explicit asynchronous stages

```arya
use python "statistics" as statistics
use std "python" as python

const stats = python.bind(statistics, {timeoutMs: 5000})
fn format(value, digits = 1) => value.toFixed(digits)

const average = [10, 20, 30]
  |> await stats.mean
  |> format(1)

print(average)
```

`|> await` waits for that stage before continuing and is allowed at module level or inside an async function. Ordinary `|>` preserves promises, so `await (value |> asyncFunction)` is also valid. Explicit stage arguments may themselves contain `await` in an async context. This syntax retains Python's existing process/JSON/cancellation contract.

For asynchronous mapping, use `values |> list.map(async fn(value) => await work(value)) |> await Promise.all`. That starts the mapped operations; use a managed Python client's concurrency/queue limits when coordinating Python jobs.

## Functions with less ceremony

```arya
fn greet(name = "World") => "Hello, " + name
fn total(initial = 0, ...values) => values.reduce(fn(sum, value) => sum + value, initial)
fn person(name) => {name: name, active: true}

print(greet(), total(10, ...[1, 2, 3]))
const combined = [0, ...[1, 2], 3]
```

An expression body returns its expression. After `=>`, `{name: name}` is an object expression; use the ordinary `fn name(...) { ... }` form for statements. Named functions remain hoisted. A concise function declaration needs a newline, semicolon, block end, or EOF after its expression.

Defaults run per call, from left to right, only for missing or undefined arguments. False, zero, empty text, and null are preserved. Defaults see outer bindings and parameters, including runtime TDZ behavior for later parameters; they cannot see body-local declarations or execute `await` in the initializer itself.

A rest parameter gathers remaining positional arguments into a list. It must be last, cannot have a default, and cannot have a trailing comma. `...value` spreads iterables inside lists, calls, and constructor argument lists. Object spread and destructuring are not introduced by this syntax.

## Validate assumptions with early exits

```arya
fn greeting(person) {
  guard person?.name else { return "Guest" }
  return "Hello, " + person.name
}
```

`guard condition else { ... }` executes its fallback when the condition is falsy. The fallback must end in `return`, `throw`, `break`, or `continue`, or an `if` whose branches both end in such exits. Ordinary context rules still apply: return requires a function; break/continue require a loop. This is a conservative syntactic exit check, not a static type-narrowing system.

The guard body can contain normal statements before its exit. This makes error handling explicit while keeping the successful path unindented. `guard` is a new reserved binding word; rename older bindings with that name. Object keys and properties named `guard` remain legal.

Rename a prior binding such as `const guard = true; print(guard)` to `const ready = true; print(ready)`. Existing records such as `{guard: true}` and access through `record.guard` keep working.

## Iterate values and positions together

`for value at index in values { ... }` supplies a zero-based index and a fresh value/index binding for every iteration. It works with the ordinary JavaScript iterable protocol, including strings and sets, without converting the iterable to a list. String iteration counts Unicode code points, as existing `for` does.

The index is local to the body; an outer index name remains visible while evaluating the iterable. Changing the body index does not change subsequent indexes. `at` is contextual in this header and remains a valid identifier elsewhere.

## Release resources reliably

```arya
use std "mysql" as mysql
use std "env" as env

const db = await mysql.connect({
  user: env.require("DB_USER"),
  password: env.get("DB_PASSWORD", ""),
  database: env.require("DB_NAME")
})

try {
  print(await db.scalar("SELECT ? + ? AS value", [20, 22]))
} finally {
  await db.close()
}
```

This example requires mysql2 and a configured MySQL server. `finally` also works after a named catch. Cleanup runs after successful completion, return, throw, and loop control. Awaited cleanup requires an async context. A return or exception in the finalizer supersedes the earlier outcome, following JavaScript completion rules. Process termination is outside this control-flow guarantee.

## List library

All operations take the input list first and leave its ordering/storage unchanged. Returned records/elements retain their existing object identities; callbacks can still perform their own mutations. A selector is a function or a nonempty, exact field name such as `"score"`; field names are not dotted paths. Function selectors receive value and index.

| Function | Result |
| --- | --- |
| `list.map(values, selector)` | Transformed list; promises remain promises for an explicit Promise.all. |
| `list.flatMap(values, selector)` | One-level flattened list; every callback result must be a list. |
| `list.filter(values, selector)` | Values whose selected result is truthy. |
| `list.find(values, selector)` | First matching value, or null if absent. |
| `list.reduce(values, reducer, initial)` | Synchronous reduction with a required initial value; reducer receives accumulator, value, index. |
| `list.groupBy(values, selector)` | Groups with string keys in a record without a prototype, safe for keys such as __proto__. |
| `list.sortBy(values, selector?, order = "asc")` | Stable sorted copy; order is asc/desc and keys must all be strings or all finite numbers. |
| `list.take(values, count = 1)` | First count items; count must be a nonnegative safe integer. |
| `list.unique(values, selector?)` | First value for each distinct key, using JavaScript Set/SameValueZero equality. |
| `list.sum(values, selector?)` | Finite numeric total; empty lists produce zero. Arithmetic uses JavaScript floating-point numbers. |

Optional selectors default to identity. Except for `map`, callbacks must produce synchronous results. Accidental promise results report `ARYA_LIST_ASYNC`; already-started work is not cancelled. Helper errors also use `ARYA_LIST_INPUT`, `ARYA_LIST_CALLBACK`, `ARYA_LIST_KEY`, `ARYA_LIST_ORDER`, `ARYA_LIST_COUNT`, and `ARYA_LIST_NUMBER`. Callback exceptions otherwise propagate normally. A non-callable dynamic pipeline stage reports `ARYA_PIPELINE_STAGE` with the original Arya caller location.

Editor diagnostics, semantic highlighting, member hints, and snippets cover these forms without executing imports or callbacks. Run the [complete data-flow examples](../fixtures/examples/data-flow/README.md) and see the [candidate release notes](releases/1.3.0-alpha.2.md) for migration and verification scope.

Use a matching compiler/extension for the new grammar. AryaCode's embedded compiler is a separate IDE integration; the companion theme/icon extension does not replace that embedded package. Older IDE builds need their compiler pin updated before their built-in Check/Run controls can understand this candidate's syntax.
