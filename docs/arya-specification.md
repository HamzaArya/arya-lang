# Arya language specification — 0.2

**Status:** normative core and approved 0.2 design, 9 November 2026. **Implementation baseline:** `0.2.0-alpha.1`, Node.js 22.15 or later. This is a pre-1.0 contract; changes require a decision record, conformance test, and migration note. The [reference](arya-language.md) and [tutorial](arya-tutorial.md) explain usage; this document decides language rules when their summaries are incomplete.

“Must” identifies a requirement. Sections 1–10 describe the implemented core. Section 11 separates the approved M3/M4 design from available preview features. Section 12 records implementation limits rather than language semantics. Host APIs follow the supported Node/ECMAScript implementation; their complete APIs and platform-dependent error wording are not redefined here.

## 1. Source text and tokens

Files use the `.arya` extension. The CLI reads UTF-8; the compiler API accepts a JavaScript string. Positions and offsets count UTF-16 code units, starting at zero in the API and one in CLI diagnostics and runtime traces. LF advances the line and resets the column. CRLF forms one line ending; a bare CR is whitespace, not a statement separator. Tabs advance one column. Supplementary characters such as `🌉` occupy two columns.

Outside strings/comments, space, tab, CR, and U+FEFF are ignored. LF is a token. No other Unicode whitespace or identifier characters are accepted. Comments start with `#` or `//` and consume through the next LF or end of input. There are no block comments.

Identifiers match `[A-Za-z_][A-Za-z0-9_]*` and are case-sensitive. Every word token beginning with `__arya` is rejected, including property names and object keys written as words. Quoted keys containing that prefix remain ordinary string data.

The keywords are:

```text
let const fn async await return if else for in while break continue
and or not true false null use as export new try catch throw
```

The following additional words cannot be binding names or bare expression names:

```text
class function var import extends super this delete typeof void instanceof
switch case default do finally yield with debugger enum implements interface
package private protected public static arguments eval
```

Keywords and reserved words may appear after `.` or as word object keys, except for the `__arya` restriction. `js` and `python` are contextual bridge names, not globally reserved words. `undefined`, `NaN`, and `Infinity` are host bindings, not literals or keywords.

Numbers match `[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?`. A sign is a unary operator. Leading zeros are decimal: `001` means `1`. `.5`, trailing-dot decimal notation, hex/binary/octal notation, separators, and bigint suffixes are unsupported. An integer followed by a named property, such as `1.toString()`, is property access. Literal conversion uses a JavaScript Number and must be finite; overflow such as `1e999` is a compile error. Underflow may become zero; integers beyond the safe integer range may round.

Strings use matching single or double quotes. They may contain any source characters except an unescaped matching quote, backslash, or LF. The escapes are exactly `\n`, `\r`, `\t`, `\\`, `\"`, and `\'`; either quote escape is accepted in either string style. There is no interpolation, multiline-string form, `\u`, `\x`, or `\0` escape. A literal NUL character inside a string is data and is safely escaped in generated code. A bare CR inside a string is preserved.

The two-character symbols are `== != <= >= += -= *= /= **`; the other symbols are `+ - * / % < > = ! ( ) { } [ ] , : ; .`. Other characters outside strings/comments cause a lexical error.

## 2. Statements, blocks, and newlines

The following grammar describes the surface. `Name` is a permitted identifier; `Expr` follows section 3. Brackets in the grammar denote optional syntax, not Arya list delimiters.

```text
Program       := { separator | Statement }
separator     := LF | ";"
Block         := "{" { separator | Statement } "}"
Declaration   := ("let" | "const") Name "=" Expr end
Function      := ["async"] "fn" Name Parameters Block
Parameters    := "(" [ Name { "," Name } [","] ] ")"
Import        := "use" ("js" | "python") String "as" Name end
Export        := "export" (Declaration | Function)
If            := "if" Expr Block ["else" (If | Block)]
While         := "while" Expr Block
For           := "for" Name "in" Expr Block
Return        := "return" [Expr] end
LoopControl   := ("break" | "continue") end
Try           := "try" Block "catch" Name Block
Throw         := "throw" Expr end
Assignment    := Target ("=" | "+=" | "-=" | "*=" | "/=") Expr end
ExpressionStmt:= Expr end
Statement     := Declaration | Function | Import | Export | If | While | For
               | Return | LoopControl | Try | Throw | Assignment | ExpressionStmt
```

An `end` requires a newline or semicolon, or is implicit immediately before `}` or end of input. Empty separators are allowed. A completed compound statement (`fn`, `if`, `while`, `for`, `try`) needs no separator before the next statement: `if false {} print(1)` is legal. A standalone `{name: 1}` is an object expression statement, not an independent scope block.

Newlines are permitted:

- between statements; before a block's opening `{`; before/after `else`; and between the try block and `catch`;
- inside parameter lists, calls, lists, objects, grouped expressions, and index brackets at item boundaries, around commas, and before closing delimiters; object keys must keep their `:` on the same line;
- after `=`, a compound assignment operator, a binary operator, or an object's `:` before its value.

Commas remain required between items; trailing commas are accepted in parameters, calls, lists, and objects. A newline before a binary operator does not continue the preceding expression. A newline is not accepted between a unary operator and operand, after `if`/`while`/`in`/`throw`/`await`/`new` before their expression/name, after `.`, between `fn` and its name/parameters, or inside an import clause. `catch` must be followed by its name on the same line. A semicolon between an if block and `else` is invalid.

A newline immediately after `return` ends a bare return; a value on the following line is another statement. `throw` always requires a value on the same line. These are parser rules, not JavaScript automatic semicolon insertion.

## 3. Expressions and operators

Primary expressions are numbers, strings, `true`, `false`, `null`, names, parenthesized expressions, lists, objects, and anonymous `fn(...) { ... }` or `async fn(...) { ... }`. A function declaration at the start of a statement requires a name; parenthesize an anonymous function used as an entire expression statement.

Lists contain comma-separated expressions, with no holes or spread. Objects contain comma-separated `word: value` or `"string": value` entries. Numeric, computed, shorthand, and method-definition keys are unsupported. Each key is an own string property, including `"__proto__"`, which does not change the prototype. Duplicate keys evaluate all values in order; the last value wins. Objects otherwise have the ordinary JavaScript object prototype.

Postfix expressions permit calls, `.word` properties, and `[Expr]` indexing, chained without restriction on the resulting value. Method calls preserve the receiver. `new Name.member(...arguments)` constructs through a name followed by zero or more named properties, then accepts postfix operations. Computed constructor names and a missing argument list are unsupported. `this` is not an Arya expression.

Precedence is listed from lowest to highest:

| Rank | Operators | Associativity / meaning |
| --- | --- | --- |
| 1 | `or` | Left; short-circuit logical OR, returns an operand |
| 2 | `and` | Left; short-circuit logical AND, returns an operand |
| 3 | `==`, `!=` | Left; strict equality/inequality |
| 4 | `<`, `<=`, `>`, `>=` | Left; JavaScript relational comparison |
| 5 | `+`, `-` | Left; addition/concatenation, subtraction |
| 6 | `*`, `/`, `%` | Left; multiplication, division, remainder |
| 7 | `**` | Right; exponentiation |
| 8 | prefix `not`, `!`, `+`, `-`, `await` | Right; unary operand includes postfix operations |
| 9 | calls, properties, indexing, constructor/postfix forms | Evaluated as the indicated chain |

Grouping overrides precedence. **`-2 ** 2` is `4`**, `-(2 ** 2)` is `-4`, and `2 ** 3 ** 2` is `512`. `await task().value` awaits the property value; use `(await task()).value` to access a property after awaiting the call result. Constructor syntax is restricted as described above; it is not an arbitrary prefix accepting another unary expression.

Operands, call arguments, collection items, and object values evaluate left to right, subject to short-circuiting. `and` returns its left operand if falsy, otherwise its right; `or` returns its left operand if truthy, otherwise its right. The skipped operand is not evaluated. `not` and `!` always return booleans. Comparisons do not chain mathematically: `a < b < c` means `(a < b) < c`.

Assignments are statements, not expressions. Targets are names, properties, or indexed values, including parenthesized targets. A compound assignment reads and writes the same target using its corresponding JavaScript arithmetic operation; receiver/index evaluation occurs once. Destructuring, assignment chaining, `%=`, `**=`, `++`, and `--` are unsupported.

## 4. Bindings and scope timing

The module, each function body, each conditional/loop body, and each try/catch body introduce lexical scopes. Parameters share their function body's declaration scope. A for variable shares its body scope; a catch variable shares its catch body scope. Nested scopes may shadow outer names. Duplicate declarations or parameters in the same scope are compile errors, including a body declaration duplicating a parameter, for variable, or catch name.

The six Arya built-ins are predeclared in module scope and cannot be redeclared there; inner scopes may shadow them. Host globals are fallback bindings and may be shadowed even in module scope.

`let` and `const` require initializers. Their scope covers the entire enclosing lexical scope, but their bindings are uninitialized until their declaration executes. Reading or writing one before initialization throws a runtime `ReferenceError` (the temporal dead zone). This also applies when an inner binding shadows an initialized outer binding: `let value = value` cannot read the outer value.

Function declarations are initialized before statements execute in their enclosing module or block, so calling a declared function earlier in that scope is legal. A function declared inside a block is not visible outside it. Parameters are initialized on a call; missing arguments are `undefined`, and extra arguments are allowed. There are no default/rest parameters or named arguments for Arya functions.

Closures capture bindings rather than snapshots. Creating a closure that refers to a later declaration is legal. Calling it before that declaration initializes the binding throws `ReferenceError`; calling it afterward reads the current value. Recursion and mutual recursion are supported. Every for-loop iteration has a fresh loop binding, so closures retain that iteration's value. The loop binding also shadows an outer name while the iterable expression is evaluated, but is still uninitialized there: `let items = [1]; for items in items {}` throws ReferenceError. Use a different loop-variable name to read the outer iterable.

`const` prevents replacement of its initialized binding; it does not freeze the referenced value. In this preview, a write to an initialized const throws runtime `TypeError`. Section 11 specifies M3's additional compile-time check. JavaScript import aliases and Python proxy aliases are const bindings, initialized where their import statement appears; JavaScript dependency loading itself occurs earlier (section 8).

## 5. Values and conversions

Arya uses JavaScript values directly: Number, string, boolean, null, undefined, object (including lists, functions and promises), and BigInt/Symbol values obtained through host calls or imports. There are no distinct Arya wrapper types. JavaScript libraries may supply other host objects. There is no static type system.

Numbers use IEEE-754 binary64; arithmetic may produce `NaN`, positive/negative infinity, or negative zero even though nonfinite numeric literals are rejected. Rounding beyond the safe integer range is observable. Division by zero does not itself throw. `%` is remainder, including its JavaScript sign behavior. `+` may concatenate strings after JavaScript primitive conversion; other arithmetic and relational comparisons use JavaScript coercion. Mixing BigInt and Number in arithmetic throws where JavaScript does.

Strict equality does not coerce: `"2" == 2` and `null == undefined` are false. Objects/functions compare by identity. `NaN == NaN` is false; positive and negative zero compare equal. `Object.is` can distinguish their signs. `number(value)` and `str(value)` apply `Number(value)` and `String(value)`, respectively. `number("")` and `number(null)` are zero; invalid numeric text and `number()` are NaN; `str()` is `"undefined"` and `str(-0)` is `"0"`. Conversion may call JavaScript conversion methods or throw their exceptions.

Conditions use JavaScript truthiness. Falsy values are false, null, undefined, positive/negative zero, NaN, the empty string, and zero BigInt. Empty lists and objects are truthy. No conversion to an explicit boolean is required in conditions.

Strings are immutable UTF-16 sequences. Indexing and `len` count code units; `len("🌉")` is 2. Iteration of a string follows the JavaScript iterator and yields Unicode code points, so `for item in "🌉"` executes once. List indexes begin at zero; negative indexes do not wrap. Missing object properties or list items normally yield undefined. Property operations, getters/setters, proxies, prototype behavior, and mutation follow JavaScript semantics; indexing null/undefined throws. Lists and ordinary objects remain mutable even through const bindings.

JavaScript calls preserve numeric edge values. JSON serialization changes that contract: ordinary `JSON.stringify` converts NaN/infinities in lists or object values to null and negative zero to zero. Python transport has the stricter rules in section 9.

## 6. Functions, control flow, and exceptions

Functions return the value of `return Expr`, or undefined for bare return or reaching their end. An `async fn` always returns a promise, resolves it with the return value, and rejects it for an uncaught exception. `await` may occur at module level or inside an async function; it follows JavaScript promise assimilation/rejection semantics. A synchronous nested function cannot inherit permission to await from its surrounding async function.

`if` executes only the selected branch. `while` tests its condition before each iteration. `for name in Expr` iterates values using the JavaScript iterable protocol; it does not enumerate object keys. A noniterable causes a runtime TypeError. `break` exits the innermost loop; `continue` starts its next iteration. Both are compile errors outside a loop, and a nested function starts a new loop context. `return` is a compile error outside a function.

`throw Expr` throws any value, not only Error objects. `try` must have a named `catch` block. The catch binding receives the thrown value and exists only in its block. There is no `finally` or bare catch form. Exceptions from an awaited rejected promise may be caught by the surrounding try/catch. A try block around promise creation without awaiting does not catch a later rejection.

Apart from stable built-in and bridge messages documented here, host error wording and stack formatting may vary by Node/Python version. Source maps identify original Arya positions for mapped user code. Injected runtime/bridge frames remain generated locations. `arya run` and AryaCode enable maps; standalone modules require `node --enable-source-maps output.mjs`.

## 7. Arya built-ins and guaranteed host globals

| Built-in | Required behavior and errors |
| --- | --- |
| `print(...values)` | Calls `console.log` with the same values; returns undefined. Rendering of complex objects is host-dependent. |
| `len(value)` | UTF-16 string length or list length. Otherwise throws TypeError with `len expects a string or list.` |
| `str(value)` | JavaScript String conversion of its first argument (undefined when omitted). |
| `number(value)` | JavaScript Number conversion of its first argument (undefined when omitted). |
| `args` | Mutable list of strings from `process.argv.slice(2)` at module initialization; runner flags precede the module and are excluded. |
| `range(end)` / `range(start, end, step = 1)` | Returns a fresh list from start inclusive to end exclusive in step's direction; incompatible direction returns an empty list. An undefined end selects the one-bound overload, and an undefined step selects 1. All effective bounds/step must be safe integers and step must be nonzero, otherwise TypeError with `range expects safe integers and a nonzero step.` More than 100,000 items throws RangeError with `range supports at most 100000 items.` |

Extra arguments to `len`, `str`, `number`, and `range` are ignored after their defined parameters. `range()` is invalid; `range(0)` is empty. The 100,000 range cap is an enforced runtime limit in this profile, not a limit on lists created in other ways.

These behaviors assume the host bindings/methods used by the runtime have not been replaced. Module-level host-name shadowing currently shares the injected runtime's lexical environment; see section 12 for that implementation limitation.

The following names are the guaranteed **bare host-global surface** for the Node execution profile. User declarations may shadow them. The shared internal `hostGlobals` list records this exact set; conformance tests verify documentation and runtime availability. This is the allowlist M3 must use independently of the machine running analysis.

<!-- host-globals:start -->
| Group | Names |
| --- | --- |
| Constants/root | `undefined`, `NaN`, `Infinity`, `globalThis` |
| Values | `Object`, `Function`, `Array`, `String`, `Number`, `Boolean`, `BigInt`, `Symbol` |
| Collections/utilities | `Math`, `JSON`, `Date`, `RegExp`, `Map`, `Set`, `WeakMap`, `WeakSet`, `WeakRef`, `FinalizationRegistry`, `Promise`, `Reflect`, `Proxy`, `Intl` |
| Errors | `Error`, `TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `EvalError`, `URIError`, `AggregateError` |
| Memory | `ArrayBuffer`, `SharedArrayBuffer`, `DataView`, `Atomics`, `Int8Array`, `Uint8Array`, `Uint8ClampedArray`, `Int16Array`, `Uint16Array`, `Int32Array`, `Uint32Array`, `Float32Array`, `Float64Array`, `BigInt64Array`, `BigUint64Array` |
| Conversion/URI helpers | `parseInt`, `parseFloat`, `isNaN`, `isFinite`, `encodeURI`, `decodeURI`, `encodeURIComponent`, `decodeURIComponent` |
| Node/web APIs | `console`, `process`, `Buffer`, `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `AbortController`, `AbortSignal`, `fetch`, `Headers`, `Request`, `Response`, `FormData`, `Blob` |
| Scheduling/services | `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `setImmediate`, `clearImmediate`, `queueMicrotask`, `structuredClone`, `performance`, `crypto` |
<!-- host-globals:end -->

Availability of a binding does not promise deterministic time, locale data, network access, environment variables, or permissions. Other Node globals/extensions can be accessed explicitly through `globalThis` or `use js`, when supplied by that host, but are outside the bare-name guarantee. CommonJS names `require`, `module`, `exports`, `__dirname`, and `__filename` are not supplied in generated ES modules. `eval` and `arguments` are reserved by Arya. The parser does not yet reject other unknown bare names; this is an M3 implementation gap, not an expansion of the promised surface.

## 8. JavaScript modules and exports

`use js "specifier" as name` is top-level only. The specifier must be a nonempty string containing no NUL. Relative paths and absolute filesystem paths are resolved against the original Arya file's directory and emitted as file URLs. Other specifiers, including `node:` names, npm package names, and explicit URLs, are delegated to Node's ESM loader; the compiler does not probe their existence or install them. npm package lookup follows the generated module's location. CLI/IDE output under the source directory preserves ordinary parent `node_modules` lookup. Moving generated output may change resolution; rebuild after moving a project.

JavaScript imports are static: dependencies load/evaluate before the importing module body, even if `use js` appears after another statement. Circular JavaScript imports have Node ESM behavior. The Arya alias is initialized at its source statement with **`namespace.default ?? namespace`**. A non-nullish default is selected, including false, zero, and empty string. An absent, null, or undefined default selects the namespace. An intentional null/undefined export remains available as `alias.default` on that namespace. This preserves 0.1 behavior; it does not distinguish absence from nullishness for alias selection. Libraries exposing a non-nullish default plus named exports can supply a wrapper module to expose a namespace-shaped API.

CommonJS modules use the namespace/default representation supplied by Node's ESM loader. JavaScript values, method receivers, callbacks, constructors, and promises cross without JSON conversion. Imported-library stack frames stay in that library, with mapped Arya caller frames.

`export let`, `export const`, `export fn`, and `export async fn` are top-level only and emit named ES module exports with live bindings. There is no default export, export list, wildcard, re-export, or import-alias export syntax. Exporting a mutable value does not freeze it. JavaScript can import built output directly; first-class Arya imports are the planned surface in section 11, not accepted current syntax.

## 9. Python bridge

`use python "specifier" as name` is top-level only, with the same string restrictions as JavaScript imports. A specifier ending in `.py` resolves relative to the original Arya file; other strings are passed to Python's import machinery (absolute paths are treated as files by the worker). Declaring the alias creates a lazy proxy without loading Python or the target module. Public member calls, including dotted public paths, start one fresh synchronous Python process per invocation. The module is imported and the target called in that process. Module globals, object identity, and process state are not shared between calls.

The CLI uses `ARYA_PYTHON` if nonempty, otherwise `python` on Windows or `python3` elsewhere. AryaCode can select an interpreter and supplies it via the environment; its settings/trust policy is an embedder contract. The process working directory is the original Arya file's directory. Local Python files also add their containing directory to Python's import search path. No shell interprets arguments.

`name.function(a, b)` supplies positional arguments. `name.function.with([a, b], {keyword: value})` supplies positional and keyword arguments. `.with` requires a list and a non-null non-list object, otherwise TypeError with `Use function.with([arguments], { keyword: value }).` The proxy is a call interface, not direct access to Python constants, attributes, or persistent instances. Member names beginning `_` fail with `Python bridge members must be public.` The property `then` is always undefined to prevent promise assimilation; `with` is reserved for the keyword-call adapter. These two Python member names cannot be selected through this proxy. Symbol property reads return undefined.

Arguments are serialized by JavaScript JSON.stringify with a rejecting replacer. Finite numbers, strings, booleans, null, lists, and serializable objects are supported. Undefined, functions, symbols, bigints, NaN, and infinities encountered as values cause TypeError with `Python bridge values must be JSON-compatible.` Cycles cause the host JSON serializer's TypeError. Object serialization follows JSON behavior: non-enumerable and symbol-keyed properties are omitted, and a `toJSON` method can transform a value before validation. This is a data serialization contract, not preservation of arbitrary JavaScript object types.

Python returns are serialized with `json.dumps(..., allow_nan=False)` and parsed as JavaScript JSON. Python lists/tuples become lists, dictionaries become objects with JSON string keys, None becomes null, and booleans remain booleans. Unsupported Python objects or nonfinite numbers raise a catchable bridge error. Large Python integers may round to Number on return; there is no bigint transport. Negative zero sent from Arya becomes JSON zero; a Python `-0.0` return retains its sign after JSON.parse. Applications needing exact integers/decimals must encode them as strings explicitly.

Python exceptions become Error objects with `Python: <exception type>: <message>`. Worker startup/timeout/buffer failures use `Python bridge failed: ...`; unsuccessful process status uses `Python bridge exited with status <status>.`; malformed stdout uses `Python bridge returned an invalid JSON response.` Python library stdout is redirected to stderr and forwarded so stdout remains the response channel. Calls have a 30-second timeout and 8 MiB stdout/stderr buffers. There is no persistent worker, async Python call, callback transport, or streaming result.

## 10. Compilation and analysis

`compile` and editor analysis must not run source code, resolve dependencies, import libraries, or start Python. Syntax/structural diagnostics include precise token positions. The compiler returns generated code and a v3 source map including source text; the caller writes them. CLI Build writes the map beside the module before launching is possible; a syntax failure cannot replace either artifact or run a previous build. The [compiler API](compiler-api.md) specifies artifact names and compatibility call forms.

In this preview, Check validates syntax, duplicate declarations, and control-flow/export/import context. Unknown names, missing dependencies, writes to const, runtime type errors, and TDZ execution are not statically validated. A passing Check is not a promise of successful execution. Source-map support is separate from interactive debugging.

## 11. Approved 0.2 work not yet implemented

These decisions bind later milestones; they are not claims about syntax/features accepted by `0.2.0-alpha.1`.

**M3 lexical resolution:** Resolve each scope's declarations before validating references, allowing forward function calls, recursion, and closures referring to later declarations. Unknown bare names and direct/compound writes to const (including import aliases and built-ins) become compile errors. Host globals come from section 7, not analysis-host introspection. Known-name use before initialization remains a runtime TDZ check; the resolver must not reject a closure merely because its declaration text precedes a captured binding. Property names and object keys are not lexical references. Scope/body/parameter duplicate rules remain unchanged.

**M4 Arya modules:** Accept `use arya "./math.arya" as math` for namespace imports of existing named exports. Specifiers must be relative filesystem paths with an explicit `.arya` suffix. The entry file's directory is the module/project root; dependencies may normalize `..` only within that root. Resolve imports relative to their importer, canonicalize real paths/symlink identity, and reject any source/output escaping the project root (and, in AryaCode, the trusted workspace). Reject cycles with an import chain; do not execute code to build the graph. Mirror generated paths beneath the entry's build/run root, with a map for every module and deterministic dependency-before-importer initialization. Imports expose live named bindings; imported namespace properties are read-only under ESM rules. No default imports, npm Arya packages, re-exports, wildcard/dynamic imports, or cycles in 0.2. Missing modules, invalid export declarations, and cycles must give source-positioned diagnostics. Graph compilation must finish successfully before any output can execute.

Until M4, use a built `.mjs` with `use js` or JavaScript tooling for module composition; `use arya` must fail Check. M4 tests will qualify its design; this specification does not mark M4 implemented.

## 12. Implementation limits and conformance

The compiler accepts at most 262,144 UTF-16 source units and 50,000 tokens excluding EOF, including newline tokens. The CLI's bounded reader separately accepts at most 262,144 UTF-8 bytes, so a Unicode file can reach the CLI limit sooner. Parser nesting is capped at 100 active guarded expression/unary/block operations, not 100 physical brace pairs. These defensive limits cause compile errors; they do not limit runtime recursion or list sizes generally. Runtime range/Python limits are described in their sections. Changes to limits must be documented without presenting them as new syntax or type rules.

**Generated-runtime scope limitation:** Module-level host declarations are accepted, but the injected runtime shares their lexical scope. Its references to `console`, `String`, `Number`, `Array`, `Math`, `undefined`, and (for Python) other host names can consequently resolve to user declarations. For example, declaring a module-level `String` function changes `str`; declaring a module-level `process` causes args initialization to encounter its temporal dead zone before user statements run. Inner-scope host shadowing does not change the runtime's outer bindings. Prefer inner scopes for such shadowing; full runtime name isolation remains an implementation improvement. The host-global allowlist is a lexical-resolution contract, not a claim that this existing runtime limitation is solved.

The executable core conformance suite is [tests/conformance.test.ts](../tests/conformance.test.ts), with a [CLI precedence fixture](../fixtures/arya/conformance/precedence.arya). It covers lexical boundaries, newline rules, precedence, short-circuit operands, block/function timing, TDZ closures, const mutation, per-iteration capture, conversions, identity, numeric edges, host-global availability, nullish import selection, import hoisting, live exports, Python JSON edges, and limits. Existing [execution tests](../tests/arya.test.ts), [editor/LSP tests](../tests/arya-editor.test.ts), and [source-map tests](../tests/source-maps.test.ts) also qualify callbacks, constructors, async behavior, control-flow rejection, passive analysis, diagnostics, and original source locations.

Run `npm run check` for type checking and all conformance layers. Platform/minimum-Node qualification is recorded separately in [source-map acceptance](source-maps.md); a written contract does not imply every platform has been tested. M3/M4 conformance remains on their roadmap checklists until implemented.
