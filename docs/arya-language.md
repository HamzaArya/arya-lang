# Arya language reference

This is the native **2.0.0** language, currently undergoing stable release qualification. Record shorthand, computed keys and record spread were added in alpha.3; older SDKs require the explicit-field alternatives below. Start with [installation](installing.md) and [getting started](getting-started.md). The [native profile](native-profile.md) defines runtime limits and host-library compatibility.

## A complete example

```arya
use std "list" as list

const currency = "AFN"
const defaults = {currency, scale: 2}
const field = "rounding"
const settings = {...defaults, [field]: "half-even"}
const people = [{name: "Samira", score: 95}, {name: "Hamza", score: 85}]

fn greeting(name: string = "World"): string => "Hello, " + name
for person at index in people |> list.sortBy("score", "desc") {
  print(index + 1, greeting(person.name))
}
print(JSON.stringify(settings))
```

`arya check file.arya` checks a program without executing its imports. `arya run file.arya` builds and runs it. `arya build file.arya -o app --release` produces a native executable. See the [CLI reference](cli.md) for caching, output protection, diagnostics and build options.

## Source, bindings and values

Source is UTF-8. Identifiers use ASCII letters, digits and underscores, cannot begin with a digit, and cannot use the reserved `__arya` prefix. Comments start with `#` or `//`. Statements can be separated by newlines or semicolons. Blocks use braces.

```arya
let count = 1
count += 2
const profile = {name: "Arya"}
profile.name = "Ledger"
print(count, profile.name)
```

`let` permits rebinding; `const` prevents rebinding but does not freeze referenced records or lists. Bindings are lexical, closures capture live bindings, and reading a binding before initialization raises an error. There is no `var` declaration or assignment expression.

Values include binary64 numbers, booleans, strings, lists, records, functions, `null` and `undefined`. Native host helpers supply other bounded values such as Map, Set, Buffer and Promise. Integer-looking numbers are still binary64; use the [decimal, money and accounting libraries](standard-library.md) when exact arithmetic is required. `0.1 + 0.2` is not an exact decimal calculation.

Single- and double-quoted strings support the documented escapes; triple-quoted strings are raw multiline text. Strings use UTF-16 indexing, while iteration yields Unicode code points. Backtick interpolation, block comments and arbitrary-precision integer literals are not provided. Use concatenation or library formatting explicitly.

## Records and composition

A record has string keys and mutable stored fields. Explicit fields remain valid:

```arya
const name = "Ledger"
const defaults = {host: "127.0.0.1", port: 8080}
const key = "currency"
const settings = {...defaults, name, [key]: "AFN", port: 9000}
print(settings.name, settings.port, settings[key])
```

| Form | Meaning | Earlier explicit equivalent |
| --- | --- | --- |
| `{name}` | Read the binding named `name` into the field named `name` | `{name: name}` |
| `{[key]: value}` | Evaluate a string key, validate it, then evaluate its value | Create a record, then assign `record[key] = value` |
| `{...base, port: 9000}` | Shallow-copy the record's fields, then set `port` | Construct explicit fields or use the existing record operations |

Fields evaluate from left to right. Later fields overwrite earlier values; overwriting does not move an existing key. Numeric-index-looking keys follow the existing `Object.keys` ordering, followed by other keys in insertion order. `__proto__`, `constructor`, empty strings, Unicode and embedded NUL are ordinary record keys; records have no JavaScript prototype chain.

Computed keys must evaluate to strings. There is no implicit numeric/object key conversion: write `{[str(7)]: "seven"}`. The checker rejects a statically known non-string key; a dynamic invalid key raises `TypeError` before its value expression runs. Shorthand requires a valid existing binding; reserved words and quoted keys still need an explicit `key: value` field.

Spread accepts **records only**. Lists, strings, functions, numbers, `null` and `undefined` are rejected. It snapshots the source's stored keys, then reads each current value once. A getter may change a later value; keys added during a getter are not included. A getter failure stops the literal. A returned Promise is copied as a value, not implicitly awaited. The copy has ordinary mutable value fields; it does not retain getter descriptors, freezing or live module-export behavior.

The copy is shallow: nested records and lists remain shared. Copying does not validate untrusted input. Use `std "validate"` first. See the runnable [record composition example](../native/examples/record-composition.arya).

```arya
const shared = {amount: 1}
const original = {shared}
const copy = {...original}
copy.shared.amount = 2
print(original.shared.amount) # 2
```

Known record spreads and literal computed keys retain structural inference, including optional-field overwrite unions. A dynamic computed key or an `any`/union spread conservatively makes the whole literal `any`, including later fields. This is a loss of checking, not proof that the resulting record matches an annotation. Prefer known record contracts and validation where precise types matter. Getters/calls can invalidate narrowing of captured mutable variables; recheck such values after effects.

## Lists and iteration

```arya
const first = [1, 2]
const values = [...first, 3]
for value at index in values {
  print(index, value)
}
let total = 0
for value in values { total += value }
print(total)
```

List and call spread are distinct from record spread: supported iterable inputs are lists and strings. Native lists support sparse holes and bounded array-style operations, with the limits in the [profile](native-profile.md). Indexed iteration uses `for value at index in values`. `range(...)` creates a bounded list of at most 100000 elements; use a `while` loop or streamed input for larger work.

## Functions, defaults and rest arguments

```arya
fn multiply(left: number, right: number = 2): number {
  return left * right
}
fn greeting(name = "World") => "Hello, " + name
fn total(...values: number[]): number {
  let result = 0
  for value in values { result += value }
  return result
}
print(multiply(4), greeting(), total(...[1, 2, 3]))
```

Use `fn` for declarations and function expressions. `=>` selects a concise expression body, including a record expression. Defaults run when needed and can refer to earlier initialized parameters; later parameter reads retain temporal-dead-zone behavior. A rest parameter must be last. Explicit non-void return contracts require a value on every continuing path. Functions are lexical closures; there are no classes, `this`, generators or method declaration shorthand.

## Control flow and operators

```arya
fn describe(amount: number): string {
  guard amount >= 0 else { return "invalid" }
  if amount == 0 { return "empty" }
  else { return "positive" }
}
let remaining = 3
while remaining > 0 {
  remaining -= 1
  if remaining == 1 { continue }
  print(describe(remaining))
}
```

Use `if`/`else`, `while`, `for`, `break`, `continue` and `return`. A `guard condition else { ... }` fallback must exit its current path with an allowed control-flow operation; it cannot silently continue after a failed condition.

| Operators, tighter groups first | Behavior |
| --- | --- |
| Calls, member/index access, `?.` | Optional access short-circuits on nullish values |
| Unary `not`, `!`, `+`, `-`, `await` | Unary operators bind before binary operators in Arya |
| `**` | Right-associative exponentiation |
| `*`, `/`, `%`; then `+`, `-` | Binary64 arithmetic; `+` also performs supported string concatenation |
| `<`, `<=`, `>`, `>=`; then `==`, `!=` | Comparisons; equality is strict, without JavaScript-style coercive `==` |
| `and`; then `or`; then `??` | Short-circuit operand selection; `??` selects a fallback only for null/undefined |
| `|>` | Input-first pipeline; use parentheses when grouping would be unclear |

Use parentheses around signed exponent bases to make intent explicit. `and`/`or` return selected operands; `not`/`!` return booleans. Arya does not provide ternary expressions, `++`/`--`, bitwise expression operators, destructuring declarations or switch statements.

## Pipelines and asynchronous work

```arya
use std "list" as list
use std "async" as tasks

const values = [3, 1, 2]
const selected = values |> list.filter(fn(value) => value > 1)
print(selected)
async fn ready(value: number): number {
  await tasks.sleep(1)
  return value
}
print(await ready(3))
print(4 |> await ready())
```

`value |> function(extra)` inserts `value` as the first argument. A plain pipeline does not await; `|> await` explicitly awaits its result. `await` is allowed at top level and inside `async fn`, not ordinary functions or parameter defaults. An async function's return annotation describes the value returned by its body; calling `ready` above produces `Promise<number>`. Scheduling is cooperative: CPU-heavy Arya code must yield for other Arya tasks to progress. Filesystem and selected native jobs use workers; this is not a Node event-loop implementation.

## Modules and exports

In `prices.arya`:

```arya
export const currency = "AFN"
export fn label(amount: string): string => amount + " " + currency
```

In `main.arya` beside it:

```arya
use arya "./prices.arya" as prices
use std "decimal" as decimal
print(prices.label(decimal.multiply("19.95", "3")))
```

Native imports use `use arya` for source modules and `use std` for bundled modules. Top-level declarations can be exported; namespace exports are live and readonly to importers. Explicit Python imports and `std "python"` use a separately installed interpreter. `use js`, npm imports and JavaScript module output belong to the retired compatibility implementation, not this SDK. See the [library catalog](standard-library.md).

## Type contracts and errors

Annotations are optional and do not add runtime validation. Supported contracts include primitives, lists, record fields, optional fields, unions, function signatures and promises; there are no user-defined generic declarations or class/interface declarations.

```arya
fn title(person: {name: string, label?: string}): string {
  return person.label ?? person.name
}
fn increment(value: number): number => value + 1
const action: fn(number): number = increment
const values: number[] = [1, 2]
print(title({name: "Samira"}), action(values[0] ?? 0))
```

`unknown` requires validation before typed member access or use. `any` explicitly bypasses checks. Mutable nested aliases keep invariant contracts; fresh-record syntax does not make shared nested data safe to widen. Static analysis cannot replace validation at external boundaries.

Record/function member reads may invoke getters. Alpha.3 discards prior null/undefined narrowing for mutable bindings captured by closures after those reads, including optional chains and compound expressions. Recheck the binding after the read, or copy its narrowed value into a `const` beforehand. Ordinary uncaptured locals retain their narrowing unless directly assigned. This deliberately rejects some previously accepted code whose refinement could become stale; it is conservative even for a structural record that happens to contain only data fields. Loop summaries conservatively treat optional chains and unknown iteration as effects; exception/finally paths discard facts for potentially changed bindings. A loop that can exit through `break` does not establish that its condition became false.

```arya
try {
  throw new Error("The operation failed")
} catch error {
  print(error.message)
} finally {
  print("cleanup")
}
```

Errors include source locations and native source frames. Use `std "debug"` for assertions/inspection/tracing and `std "log"` for structured logs. [Security and debugging](native-security-debugging.md) documents practical controls. Expression nesting is bounded to 100; source and runtime resource limits remain enforced.

## Familiarities and differences from JavaScript

| Area | Arya native behavior |
| --- | --- |
| Familiar forms | `let`, `const`, braces, lists, property access, `async`/`await`, optional access and many host-style helpers |
| Function/module syntax | `fn`, `use std`, `use arya`, `export fn`; no JavaScript `function`, `import` or npm resolution |
| Equality and logic | `==` is strict; `and`/`or`/`not` are canonical logical forms |
| Record syntax | Alpha.3 adds shorthand/computed/spread forms; keys must be strings and spread sources must be records |
| Object model | No prototype chain, classes or complete JavaScript property-descriptor semantics |
| Numbers/text | Binary64 arithmetic and UTF-16 indexing are familiar; exact decimals use explicit libraries |
| Execution | Ahead-of-time C11/native executable with Arya's runtime; no Node or JavaScript execution engine |
| Missing constructs | Destructuring, user generics, generators, template interpolation, ternaries and general JavaScript syntax are not accepted |

The earlier aliases `keep`, `task`, `give`, `when`, `otherwise`, `each` and implicit `say` were already retired before alpha.3; use `const`, `fn`, `return`, `if`, `else`, `for` and `print`. Properties such as `ui.when` remain legal. This update adds syntax without renaming existing canonical forms. See [changes and verification](native-syntax.md) for qualification and remaining work.
