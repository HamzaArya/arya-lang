# Arya 0.2 preview — readable code, connected ecosystems

New to Arya? Start with the [beginner tutorial and nine runnable lessons](arya-tutorial.md). This document is the language reference.

For VS Code-compatible editors, Sublime, JetBrains, Vim/Neovim, Emacs, and other clients, use the [editor setup guide](arya-editors.md). The portable kit includes a local VSIX, an installable compiler, a standard LSP server, and syntax adapters; compatibility and verification vary by editor.

Arya is an experimental programming language developed in its own repository and integrated into AryaCode through a versioned package. Its `.arya` files compile to JavaScript ES modules and run on the bundled Node.js runtime. The first version supports ordinary scripts, Node web applications, JavaScript/npm libraries, and Python function calls. It uses its own lexer and parser; opening a file and checking its syntax do not execute imports or user code.

The longer-term direction is one readable language for scripts, applications, and access to multiple ecosystems. Version 0.1 establishes the JavaScript and Python paths. It does not yet compile to native machine code or directly import arbitrary C, C++, Rust, Go, Java, or .NET libraries. Native libraries already exposed through a compatible Node addon or Python package can be used through that ecosystem, subject to the bridge limits below.

## Start in AryaCode

Open `fixtures/arya` as a workspace, open `hello.arya`, trust the workspace, and click **Run Current File** or press **Ctrl+F5**. **Build / Check Current File** compiles without executing the program. Use **Stop Current File** for a running web server. The Run status button, editor toolbar, and Explorer context menu recognize Arya files.

The editor includes syntax highlighting, comments and bracket pairing, snippets, keyword/builtin completion, builtin hover help, top-level symbols in Outline, and live syntax diagnostics. Try the `fn`, `for`, `usejs`, and `usepy` snippets. Library API completion, static type analysis, formatting, and source-level debugging are future work.

From this repository:

```sh
npm run arya -- run fixtures/arya/hello.arya
npm run arya -- run fixtures/arya/bridge.arya
npm run arya -- run fixtures/arya/web.arya
npm run arya -- check fixtures/arya/hello.arya
npm run arya -- build fixtures/arya/hello.arya
```

The CLI bootstrap builds the compiler locally. After `npm run build`, the standalone CLI is also available as `node dist/cli.cjs`. `run` accepts program arguments after the file, optionally separated by `--`; access them through `args`.

CLI build artifacts go into `.arya/build` beside the source. Editor artifacts go into `.arya/run` beside the source. These locations preserve npm dependency discovery in nested packages. Local JavaScript/Python import paths are resolved relative to the original source. Generated files embed those local paths; rebuild after moving a project. A syntax failure never launches a previous build. Generated directories are ignored by Git.

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

Builtins: `print(...values)`, `len(stringOrList)`, `str(value)`, `number(value)`, `range(end)`, `range(start, end, step)`, and `args`. `range` excludes the end and is limited to 100,000 items. Standard Node globals such as `JSON`, `Promise`, `Math`, `Date`, `fetch`, and `process` are available when running under Node. Source files are limited to 256 KiB, 50,000 tokens, and bounded nesting in this prototype.

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

`use js` imports an ES module namespace and selects its default export when present; otherwise it binds the namespace. This also supports CommonJS libraries exposed through Node's ESM loader. Calls keep real JavaScript values, promises, constructors, callbacks, and method receivers. npm modules, `node:` builtins, and relative `.mjs`/`.cjs` helpers are supported. For a library with a default export and separate named exports, use a small `.mjs` wrapper to expose the named API you need.

Arya exports become ordinary ES module exports. Compile a shared `.arya` file with `build`, then import its generated `.mjs` module from JavaScript or with `use js`. Automatic multi-file Arya compilation is not implemented yet. Browser frameworks can consume generated JavaScript through their normal bundler, but this release supplies no JSX syntax, browser build pipeline, or framework-specific integration. Python imports require Node and cannot run in a browser.

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

Each call starts a fresh Python process, sends one JSON request, and returns one JSON response. Strings, finite numbers, booleans, null, lists, and JSON-compatible objects cross the bridge. Python exceptions become catchable Arya/JavaScript errors. Python stdout is forwarded to stderr so library logging does not corrupt results. Calls are synchronous, limited to 30 seconds and 8 MiB output, and do not retain Python state. Python objects, constants, callbacks, generators, GUI event loops, and direct NumPy/Pandas objects are not transported. A helper can convert a data-frame result to JSON-friendly rows. For repeated or expensive work, batch it into one Python helper call.

## Verification and next steps

`npm run check` covers the compiler, execution, Node ESM/CommonJS interoperability, Python bridge, syntax errors, trust, output containment, and existing IDE services. `ARYACODE_TEST_WORKBENCH=/path/to/AryaCode npm run test:arya` exercises editor services, compile/run, both bridges, a live HTTP server, duplicate prevention, and stopping the server in a disposable desktop profile.

Source maps are available in the 0.2 preview: CLI and AryaCode runs map runtime stacks to original Arya locations. Standalone generated modules require `node --enable-source-maps generated.mjs`. Interactive debugging remains future work. The next language milestones are the specification, lexical name checks, first-class Arya modules, and interop hardening; see [the roadmap](arya-roadmap.md). Native compilation, ownership/type-system design, package distribution, and compatibility across all language frameworks remain open work; this prototype makes no native-performance claim.
