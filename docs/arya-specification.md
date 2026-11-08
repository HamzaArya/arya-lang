# Arya language specification — 0.2 draft

Status: working baseline, not a final 0.2 compatibility promise. This document records the extracted implementation and the decisions still required by M2 in the [roadmap](arya-roadmap.md). The [language reference](arya-language.md) provides runnable examples.

## Current language contract

- Names use ASCII letters, digits, and underscores, starting with a letter or underscore. Keywords, JavaScript reserved names, and `__arya` prefixes are restricted.
- Statements end with a newline or semicolon. Blocks use braces. Comments begin with `#` or `//`.
- Strings use single/double quotes and the escapes `\n`, `\r`, `\t`, `\\`, `\"`, and `\'`. Numbers are decimal with optional fractional and exponent parts.
- Bindings use initialized `let` or `const`. Blocks, functions, loops, and catch clauses introduce scopes. Duplicate declarations in the same parser scope fail.
- Functions use `fn`; anonymous functions, recursion, closures, and `async fn` are supported. `await` is valid at module level or inside an async function.
- Control flow includes `if`/`else`, `for name in iterable`, `while`, `break`, `continue`, `return`, `try`/`catch`, and `throw`. Context checks reject misplaced control statements.
- Values use JavaScript numbers, UTF-16 strings, booleans, null, arrays, objects, functions, and promises. Conditions use JavaScript truthiness. Arrays/objects have identity and are mutable. `const` protects a binding, not object contents.
- Arya `==` and `!=` mean strict JavaScript equality/inequality. `and`/`or` short-circuit and return operands; `not` means logical negation.
- Binary precedence, low to high: `or`; `and`; equality; comparisons; addition/subtraction; multiplication/division/remainder; exponentiation. Exponentiation is right-associative. Unary operators currently bind before exponentiation, so `-2 ** 2` is `4`.
- `print` delegates to console output; `len` accepts strings/arrays; `str` and `number` use JavaScript conversion; `args` contains program arguments. `range` accepts safe integer bounds and a nonzero step, excludes its end, and caps output at 100,000 values.
- `use js` binds `namespace.default ?? namespace` for a static ES-module import. Paths resolve relative to the source file. `export` supports top-level bindings/functions.
- `use python` provides public function calls through one fresh synchronous Python process per call. JSON-compatible values cross the bridge. `.with` supplies keyword arguments. Calls have a 30-second timeout and 8 MiB buffers; Python identity/state/callbacks are not transported.
- `check` parses without executing imports. It currently does not resolve lexical references, validate types, or verify dependency availability.
- Source maps preserve original source locations. The execution runtime is Node; generated JavaScript contains Arya built-ins and an optional Python bridge.

## Decisions required before 0.2 final

- [ ] Preserve or change unary-minus/exponentiation precedence, with migration tests.
- [ ] Specify a guaranteed host-global allowlist for lexical name checks.
- [ ] Specify function visibility, declaration timing, and closure behavior before resolving names.
- [ ] Specify conversions, numeric edge cases, and bridge handling of values outside JSON.
- [ ] Resolve intentional `null`/`undefined` JavaScript default exports.
- [ ] Finalize relative `.arya` namespace import syntax, project boundary, export validation, and cycle diagnostics.
- [ ] Turn each surprising rule into a conformance case with expected output or diagnostics.

Relative `.arya` imports and lexical name checks are planned features, not accepted syntax or behavior in `0.2.0-alpha.1`.
