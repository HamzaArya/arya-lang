# Arya practical language reference

The current source is **1.3.0-alpha.9**, an unpublished reliability candidate focused on Node.js applications. The published npm preview is **1.3.0-alpha.7** on `next`; `latest` remains on the older 1.2 release. See [runtime and migration](node-runtime.md). See the [documentation index](README.md) for all guides. Start with the [web application guide](arya-web.md) for `const`, `fn`, `if`/`else`, `for`, `return`, `print`, and HTML-first web projects with separate page, CSS, and browser JavaScript files. The [beginner tutorial and nine runnable lessons](arya-tutorial.md) teach the same canonical syntax. The [specification and version amendments](arya-specification.md) define precise rules and migration requirements.

For VS Code-compatible editors, Sublime, JetBrains, Vim/Neovim, Emacs, and other clients, use the [editor setup guide](arya-editors.md). The portable kit includes a local VSIX, an installable compiler, a standard LSP server, and syntax adapters; compatibility and verification vary by editor.

Arya is an experimental programming language developed in its own repository and integrated into AryaCode through a versioned package. The default target compiles `.arya` files to JavaScript ES modules and runs them on Node.js. It supports scripts, Node web applications, JavaScript/npm libraries, Python function calls, and the new web view syntax. Arya uses its own grammar; opening a file and checking its syntax do not execute imports or user code.

The longer-term direction is one readable language for scripts, applications, and access to multiple ecosystems. The current source uses a single Node.js runtime. The earlier native compiler is retired; see the [migration guide](node-runtime.md). Direct arbitrary C, C++, Rust, Go, Java, or .NET imports remain unsupported. Libraries exposed through a compatible Node addon or Python package can be used through the JavaScript profile, subject to the bridge limits below.

Arya 1.2.0-alpha.4 includes nullish defaults (`??`), optional access/index/calls (`?.`), and leading-dot multiline chains on Node.js. The CLI/editor add source excerpts, help, spelling Quick Fixes, and JSON check reporting. See the [syntax and debugging guide](syntax-and-debugging.md).

For web interfaces and desktop GUI applications, the JavaScript target includes `use std "ui"`: styled components, responsive layouts, browser state, forms, JSON API actions, and animation presets. The same UI can run in an optional Electron window. See the [UI guide](ui-apps.md) for npm starters and the component/animation API.

The source candidate also adds [reusable UI sections and full-page templates](ui-patterns.md) for landing pages, dashboards, settings, and sign-in interfaces.

## Readable application flow

Starting in 1.3.0-alpha.2, the source candidate adds `|>` and `|> await`, expression-bodied functions with defaults/rest parameters, list/call spread, terminating guards, indexed iteration, and finally cleanup. The `list` library supplies input-first collection operations. See the [syntax guide](flow-syntax.md) for exact evaluation, scope, async, and error behavior. Block functions remain accepted; rename earlier bindings called `guard`. For the removal of alternate spellings in alpha.4, see [syntax migration](syntax-migration.md).

## Canonical syntax and web applications

Use `let` for mutable bindings, `const` for fixed bindings, `fn`/`return` for functions, `if`/`else if`/`else` for conditions, `for` for iteration, and `print` for output. Starting in 1.3.0-alpha.4, these are the only spellings for those constructs. Earlier aliases are removed; [syntax migration](syntax-migration.md) lists every replacement.

Web projects require `index.html` by default; `arya init my-app --web` creates the entry, an Arya server, and separate public CSS/JavaScript assets. `web.serve(3000)` starts that file-based application. The optional `{html: false}` setting permits an API-only or inline-view application.

On the JavaScript target, `view { ... }` creates HTML with class shorthand such as `body bg-dark`, escaped text/attribute expressions, and literal `style`/`script` contents. Raw triple-double-quoted strings support multiline CSS, JavaScript, and ordinary text. `use std` provides the [standard libraries](standard-library.md), including candidate-only list helpers. The [async Python guide](python-async.md) explains nonblocking calls, binding imports, batching, cancellation, and virtual environments. The [service guide](services.md) documents schemas, structured logs, operational HTTP helpers, and a multi-file example. The MySQL library includes verified pooled connections, prepared queries, transactions, health checks, and graceful closure; see the [database guide](mysql.md). Embedded browser scripts do not capture server-side Arya/Python variables. See the [web guide](arya-web.md) for complete APIs and a runnable example:

```sh
npm run build
npm run arya -- run fixtures/web/studio.arya
```

The remainder of this reference describes the Node.js runtime using canonical syntax. Programs use the documented Node host globals and library contracts below.

## Start in AryaCode

Open `fixtures/arya` as a workspace, open `hello.arya`, trust the workspace, and click **Run Current File** or press **Ctrl+F5**. **Build / Check Current File** compiles without executing the program. Use **Stop Current File** for a running web server. The Run status button, editor toolbar, and Explorer context menu recognize Arya files.

The editor includes syntax highlighting, comments and bracket pairing, snippets, keyword/builtin completion, builtin hover help, top-level symbols in Outline, live syntax/name/const-write diagnostics, and same-file lexical go-to-definition. Try the `fn`, `for`, `usejs`, and `usepy` snippets. Documented standard-library member hints, MySQL handle completions, semantic colors, and spelling Quick Fixes are available. Arbitrary dependency introspection, static type analysis, formatting, and source-level debugging remain future work.

From this repository:

```sh
npm run arya -- run fixtures/arya/hello.arya
npm run arya -- run fixtures/arya/bridge.arya
npm run arya -- run fixtures/arya/web.arya
npm run arya -- check fixtures/arya/hello.arya
npm run arya -- build fixtures/arya/hello.arya
```

Run `npm ci` and `npm run build` before using the repository CLI, which is also available as `node dist/cli.cjs`. `run` accepts program arguments after the file, optionally separated by `--`; access them through `args`.

CLI graph artifacts go into `.arya/build` beside the entry source, mirroring dependency paths. Editor graph artifacts go into fingerprinted `.arya/run` directories. Node package lookup follows the generated tree and the entry project's parent `node_modules` chain; packages installed only in an original nested dependency folder are not automatically resolved. Local JavaScript/Python import paths are resolved relative to the original source. Generated files embed those local paths; rebuild after moving a project. A syntax, name, or dependency-graph failure never launches a previous build. Outputs are staged as a complete owned graph before publication. Generated directories are ignored by Git.

## Readable basics

```arya
fn greet(name) {
  return "Hello, " + name
}

let languages = ["Arya", "JavaScript", "Python"]
for language in languages {
  print(greet(language))
}

let total = 0
for value in range(1, 6) {
  total += value
}

if total == 15 and len(languages) == 3 {
  print("Everything is connected.")
} else {
  print("Keep building.")
}
```

Statements use newlines or semicolons. Blocks use braces. `#` and `//` start line comments. Lists, call arguments, object literals, and parenthesized expressions can span lines; after a binary operator, its next operand can start on the following line. Strings use single or double quotes, with `\n`, `\r`, `\t`, escaped quotes, and `\\` escapes. Names use ASCII letters, digits, and underscores, starting with a letter or underscore.

| Feature | Syntax |
| --- | --- |
| Mutable binding / constant binding | `let score = 0` / `const title = "Arya"` |
| Objects and lists | `{name: "Arya", ready: true}` / `[1, 2, 3]` |
| Property / list item | `person.name` / `values[0]` |
| Updates | `score += 1` / `values[0] = 42` |
| Conditions | `if ready { ... } else if waiting { ... } else { ... }` |
| Loops | `for item in items { ... }` / `while running { ... }` |
| Loop control | `break` / `continue` |
| Functions / callbacks | `fn add(a, b) { return a + b }` / `fn(value) { return value * 2 }` |
| Async work | `async fn load() { return await fetch(url) }` |
| Exceptions | `try { ... } catch error { print(error.message) }` / `throw new Error("message")` |
| Constructors | `new library.Client(options)` |
| Module exports | `export fn add(a, b) { return a + b }` / `export const version = "1"` |

Values and interoperability follow JavaScript semantics: numbers are IEEE-754 doubles, strings use UTF-16, lists are arrays, and objects and functions retain their identities. Conditions use JavaScript truthiness. `==` and `!=` compile to strict equality and inequality; `and`, `or`, and `not` become short-circuit JavaScript operators. `and`/`or` return operand values. `const` prevents reassignment of the binding; it does not freeze an object. Arithmetic supports `+ - * / % **`; mixing strings with `+` follows JavaScript concatenation. Exponentiation is right-associative, and Arya unary operators bind before exponentiation (`-2 ** 2` is `(-2) ** 2`).

Builtins: `print(...values)`, `len(stringOrList)`, `str(value)`, `number(value)`, `range(end)`, `range(start, end, step)`, and `args`. See the [builtin and host-global contract](arya-specification.md#7-arya-built-ins-and-guaranteed-host-globals) for exact conditions and the complete guaranteed Node global list, including `JSON`, `Promise`, `Math`, `Date`, `fetch`, and `process`. Source size, token count, and nesting caps are [implementation limits](arya-specification.md#12-implementation-limits-and-conformance); the CLI counts UTF-8 bytes while the compiler API counts UTF-16 units.

Functions are visible throughout their enclosing module or block. A `let`/`const` binding exists throughout its scope but cannot be used until its declaration runs. A closure can refer to a later declaration and use it after initialization. See [scope timing](arya-specification.md#4-bindings-and-scope-timing) for shadowing, loop capture, and import alias timing. `check` rejects unknown lexical names and direct/compound writes to const, import aliases, and Arya built-ins. It reports independent semantic errors together and may suggest a unique close spelling. Properties and object keys are excluded from lexical lookup, so mutable objects bound with const still work. Missing dependencies and runtime initialization order are not validated. Annotated modules also receive the bounded [optional type checks](business-applications.md#optional-type-annotations); unannotated modules remain dynamic, and external API declarations remain trusted boundaries.

## JavaScript libraries and frameworks

```arya
use js "node:path" as path
use js "express" as express

let app = express()
app.get("/", fn(request, response) {
  response.json({message: "Hello from Arya", file: path.basename("/app/main.arya")})
})
app.listen(3000)
```

Install a package with npm in the source file's project before using it. Arya does not install libraries automatically. For the optional Express example, create a new project folder, run `npm init -y` followed by `npm install express` there, copy `fixtures/arya/express.arya` into it, and open that folder in AryaCode. The [tutorial](arya-tutorial.md#lesson-5-use-an-existing-javascript-library) walks through these steps. `web.arya` supplies a dependency-free HTTP app with a page and a JSON endpoint at `http://localhost:3000`.

`use js` selects `namespace.default ?? namespace`: a non-nullish default becomes the alias, while an absent, null, or undefined default selects the namespace. An intentional null/undefined default remains accessible as `alias.default`. This also supports CommonJS libraries exposed through Node's ESM loader. Calls keep real JavaScript values, promises, constructors, callbacks, and method receivers. npm modules, `node:` builtins, and relative `.mjs`/`.cjs` helpers are supported. For a library with a non-nullish default and separate named exports, use a small `.mjs` wrapper to expose the named API you need. JavaScript dependencies execute before the Arya module body; the alias initializes at its `use` statement.

Arya exports become ordinary ES module exports. Compile a shared `.arya` file with `build`, then import its generated `.mjs` module from JavaScript or with `use js`. First-class multi-file compilation is available with `use arya "./math.arya" as math`; one Check/Build/Run resolves the entry's contained dependency graph, rejects cycles/missing direct exports, and emits a map per module. Imports must be relative with an explicit `.arya` suffix. See the [module contract](arya-specification.md#11-arya-modules-and-build-graphs) and [completed learning project](learning-path.md). Browser frameworks can consume generated JavaScript through their normal bundler, but this release supplies no JSX syntax, browser build pipeline, or framework-specific integration. Python imports require Node and cannot run in a browser.

## Python bridge

```arya
use python "math" as math
use python "./statistics_helper.py" as statistics

print(math.sqrt(81))
let report = statistics.summarize([10, 20, 30])
print(report.mean)
print(statistics.round_mean.with([[1, 2, 4]], {digits: 2}))
```

An ordinary Python helper needs no Arya SDK:

```python
import statistics

def summarize(values):
    return {"count": len(values), "mean": statistics.mean(values)}

def round_mean(values, *, digits=2):
    return round(statistics.mean(values), digits)
```

The bridge imports installed module names or source-relative `.py` files and calls public functions. Nested public functions such as `package.submodule.function(...)` work when the package exposes that submodule. Use `function.with([positionalArgs], {keyword: value})` for keyword arguments. Install dependencies into the selected Python environment normally.

In AryaCode, `arya.tools.python` wins, followed by the workspace `.venv`/`venv`, then the bundled or discovered interpreter. The CLI uses `ARYA_PYTHON` when set, otherwise `python3` (`python` on Windows).

Each call starts a fresh Python process, sends one JSON request, and returns one JSON response. Strings, finite numbers, booleans, null, lists, and JSON-compatible objects cross the bridge. Python exceptions become catchable Arya/JavaScript errors. Python stdout is forwarded to stderr so library logging does not corrupt results. Calls are synchronous, limited to 30 seconds and 8 MiB output, and do not retain Python state. Stable `error.code` values and action hints identify interpreter/module/file/member, input/return, timeout, output, and protocol failures; UTF-8 is enforced for pipes. See the [interop guide](interop.md) and its runnable npm/batch examples. Python objects, constants, callbacks, generators, GUI event loops, and direct NumPy/Pandas objects are not transported. A helper can convert a data-frame result to JSON-friendly rows. For repeated or expensive work, batch it into one Python helper call.

## Verification and next steps

`npm run check` covers core conformance, execution, Node ESM/CommonJS interoperability, Python transport, syntax diagnostics, source maps, and portable editor/LSP services. AryaCode's separate repository owns workspace trust, IDE containment, and desktop acceptance; its `ARYACODE_TEST_WORKBENCH=/path/to/AryaCode npm run test:arya` exercises those editor workflows in a disposable desktop profile.

Source maps and lexical checks remain available in the 1.2 preview. CLI and AryaCode runs map runtime stacks to original Arya locations; standalone generated modules require `node --enable-source-maps generated.mjs`. Arya module graphs and actionable Python bridge codes are implemented. Interactive debugging remains future work as tracked in [the roadmap](arya-roadmap.md). Local package distribution is implemented. Optional static types are implemented with the limits in the [business API guide](business-applications.md). Arbitrary ecosystem compatibility and stable/platform qualification remain separate work. Programs inherit Node.js performance characteristics; benchmark representative application workloads.
