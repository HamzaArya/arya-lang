# Migrate to canonical Arya syntax

The **1.3.0-alpha.4 source candidate** uses one spelling for each declaration, function, branch, loop, and output construct. The earlier alternatives are removed from the parser and runtime. This is a breaking prerelease change; the published 1.2.0-alpha.4 package retains its older syntax.

## Replace the removed forms

| Removed form | Canonical form |
| --- | --- |
| `keep name = value` | `const name = value` |
| `task name(...) { ... }` | `fn name(...) { ... }` |
| `task(...) { ... }` | `fn(...) { ... }` |
| `async task name(...) { ... }` | `async fn name(...) { ... }` |
| `give value` / bare `give` | `return value` / bare `return` |
| `when condition { ... }` | `if condition { ... }` |
| `otherwise { ... }` | `else { ... }` |
| `otherwise when condition { ... }` | `else if condition { ... }` |
| `each value in values { ... }` | `for value in values { ... }` |
| `each value at index in values { ... }` | `for value at index in values { ... }` |
| Implicit `say(...)` output | `print(...)` |

The replacements also apply inside exported declarations, anonymous/async callbacks, concise functions, nested blocks, and pipeline stages. Use `export const`, `export fn`, and `export async fn`. Mutable bindings continue to use `let`.

New code should look like this:

```arya
const names = ["Hamza", "Samira"]

fn greet(name = "World") => "Hello, " + name

for name at index in names {
  if index == 0 {
    print(greet(name))
  } else {
    print(index + 1, greet(name))
  }
}
```

This prints `Hello, Hamza` and `2 Hello, Samira` on separate lines.

## Preserve values, properties, and library calls

Change language tokens rather than doing an unrestricted search-and-replace. Strings, comments, filenames, object keys, imported members, and application data may contain these words without using the removed syntax. In particular, `ui.when(...)` remains the UI library's conditional visibility helper; `request.body.task` remains a property read.

The removed words are now ordinary identifiers. For example, `const task = {title: "Learn Arya"}` and a user-defined `fn say(value) { return value }` are legal. They receive normal lexical scope and assignment checks. An undeclared `say(...)` fails with `ARYA_UNKNOWN_NAME`; no hidden runtime alias supplies it.

The language still supports block and concise `fn` bodies, `async fn`, defaults/rest parameters, spreads, pipelines, indexed `for` loops, guards, and finally cleanup. This change selects canonical spellings without changing those evaluation or scope rules.

## Upgrade and verify

1. Build this checkout or install its exact reviewed candidate archive using [candidate setup](node-runtime.md#try-the-candidate). An unpublished candidate cannot be installed from npm by version alone.
2. Replace the removed forms throughout the application's Arya modules. Keep original strings and library APIs intact.
3. Install the matching bundled editor extension. AryaCode's embedded compiler must be updated separately in its own integration workflow; a companion extension does not replace it.
4. Run `arya check main.arya`, then the application's tests and examples. Check and editor analysis reject removed syntax without executing imports.
5. Rebuild all generated JavaScript/maps with the new compiler. Previously generated output retains the old compiler's runtime until rebuilt.

New starters, repository fixtures, documentation examples, snippets, member hints, grammars, and the UI preview use the canonical spellings. Earlier [release notes](releases/README.md) and [historical documents](history/README.md) retain their original version-specific syntax.
