# Arya 1.2 HTML-first web projects

Arya `1.2.0-alpha.4` supports HTML-first web applications with a real HTML entry file by default. Arya handles the server; standard HTML, CSS, and browser JavaScript handle the page. This experimental preview is published on npm as `latest`. For interfaces written in Arya, see [UI and desktop applications](ui-apps.md).

## Create a project

Use the interactive creator to choose a web app, API server, CLI tool, native CLI, UI app, or desktop app. Use the published preview:

```sh
npm create arya-language@latest
cd my-arya-app
npm install
npm run dev
```

For portable/offline creation, use the retained version-matched compiler archive:

```sh
node dist/create.cjs my-app --compiler artifacts/arya-language-1.2.0-alpha.4.tgz
```

The wizard asks what you want to build. Choose **Web app**. The optional compiler archive is copied into `vendor/` and makes the compiler dependency portable between machines. Otherwise `package.json` pins the exact compiler version on npm. See the [creator guide](project-creator.md) for automation and portable installation.

The existing command `arya init my-app --web` directly selects the web template. It now creates a package manifest too:

```text
my-app/
  package.json       # Compiler dependency and npm scripts
  main.arya          # Server logic and API functions
  index.html         # One HTML shell with div#root
  public/
    styles.css       # Served at /styles.css
    app.js           # Renders the interface inside #root
  README.md
  .gitignore
```

The page body contains only `<div id="root"></div>`. Browser JavaScript mounts the app there and renders API results within that subtree. Use `fn`/`return`, `const`/`let`, and `if`/`else` for the generated server logic.

The generated browser script renders a complete page inside #root and supplies an API interaction. Open `http://localhost:3000` after starting it; stop with Control+C. Node.js 22.15 or later is required. Express is optional. Python is needed only for routes that call Python.

A minimal `main.arya` is:

```arya
use std "web" as web
web.serve(3000)
```

Its required `index.html` uses ordinary HTML:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Made with Arya</title>
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/app.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

Default paths resolve from the original `.arya` module importing `web`, rather than the terminal's current directory or `.arya/build`. A missing HTML entry produces a startup error before the server listens. Check remains passive: it checks Arya code without starting a server or validating browser assets. HTML files are served as written; they do not interpolate Arya expressions.

The runnable [studio project](../fixtures/web/studio.arya) uses [index.html](../fixtures/web/index.html), [styles.css](../fixtures/web/public/styles.css), and [app.js](../fixtures/web/public/app.js):

```sh
npm run arya -- run fixtures/web/studio.arya
```

The native target supports the branded core syntax but rejects the web/MySQL libraries and inline web views. Node and native standard libraries are separate profiles; identical import spelling does not promise identical timing or APIs.

## Write the logic in Arya

```arya
keep passingScore = 60

fn result(score) {
  if score >= passingScore {
    return "Passed"
  } else {
    return "Keep practicing"
  }
}

each score in [40, 70, 95] {
  say(result(score))
}
```

| Arya spelling | Meaning | Existing spelling, still supported |
| --- | --- | --- |
| `keep name = value` | Declare a binding that cannot be reassigned | `const` |
| `fn name(values) { ... }` | Define a reusable function | `task` (compatibility alias) |
| `async fn name(values) { ... }` | Define an asynchronous function | `async task` (compatibility alias) |
| `return value` | Return a value from a function | `give` (compatibility alias) |
| `if condition { ... }` | Run a conditional branch | `when` (compatibility alias) |
| `else { ... }` / `else if ...` | Add another branch | `otherwise` / `otherwise when` (compatibility aliases) |
| `each item in items { ... }` | Iterate through values | `for` |
| `say(values)` | Print values to the terminal | `print(values)` |

Use `fn` and `return` for functions, and `if`, `else if`, and `else` for conditions. The earlier `task`, `give`, `when`, and `otherwise` aliases still run for compatibility, but new examples, snippets, and completion suggestions use the preferred forms.

These spellings keep the existing scope, evaluation, and error rules. `keep` prevents reassignment; it does not freeze an object. A newline immediately after `return` ends a bare return. `fn` also works for anonymous callbacks. `say` is a built-in binding with the same declaration restrictions as `print`.

The six words `keep`, `task`, `give`, `when`, `otherwise`, and `each` are newly reserved. Rename older variables/functions using those names. For example:

```arya
# Before 1.2:
# let task = {title: "Learn Arya"}

# After:
let item = {title: "Learn Arya"}
say(item.title)
```

Existing `fn`, `const`, `if`, `else`, `for`, `return`, and `print` code continues to work when it does not use the newly reserved words as identifiers.

## Optional inline views

The default project uses `index.html`. For small tools or generated pages, the earlier inline view syntax remains available. To run an application without an HTML entry, explicitly pass `{html: false}` as the third `web.serve` argument, as shown in [inline.arya](../fixtures/web/inline.arya).

`view { ... }` is an expression producing an HTML string. Element names replace opening and closing HTML tags. Braces group children; a string or a parenthesized expression supplies text.

```arya
keep name = "Hamza"
keep home = view {
  html {
    head {
      title "My Arya page"
      style """
        .bg-dark { background: #111; color: white; }
        body { font-family: system-ui; padding: 2rem; }
      """
    }
    body bg-dark {
      h1 "Hello from Arya"
      p ("Welcome, " + name)
      a(href="/about", title="About this app") "About"
      button(id="hello") "Click me"
      script """
        document.getElementById('hello').addEventListener('click', () => {
          alert('Hello from the browser!');
        });
      """
    }
  }
}
```

`body bg-dark` assigns a class, equivalent to `<body class="bg-dark">`. It does not install a CSS framework or define that class automatically. Attach attribute parentheses directly to the element name; a space before `(` introduces text instead. Use attributes for names and values: `input(type="text", required=true)`. Dynamic attribute values are Arya expressions. Attribute names also permit hyphens, as in `button(data-id="save") "Save"`.

Text and attribute values are escaped for HTML. Text such as `"<strong>Hello</strong>"` displays as text, rather than becoming markup. Void elements such as `input`, `img`, and `br` do not receive closing tags. A view with an `html` root includes a doctype.

`style` and `script` accept string literals. Triple-quoted strings preserve multiline CSS and JavaScript without Arya escaping. Do not interpolate server values into these blocks: load dynamic data through an HTTP endpoint. A script or style literal containing its own closing-tag sequence is rejected at compile time; keep embedded content inside its element. Inline event attributes such as `onclick` are unsupported; attach browser handlers in `script`.

A triple-quoted string is also useful for ordinary multiline text:

```arya
keep message = """First line
Second line"""
say(message)
```

## Serve HTML and JSON

```arya
use std "web" as web
use python "math" as math

# index.html is required beside this source file.
web.serve(3000, {
  "GET /api/root": fn(request) {
    keep value = number(request.query.value or "81")
    return {root: math.sqrt(value)}
  },
  "POST /api/echo": fn(request) {
    return {received: request.body}
  }
})
```

`web.serve(port, routes, options)` returns a Node HTTP server, including its `.close()` method. Both `routes` and `options` are optional. The host defaults to `127.0.0.1`. By default, startup requires `index.html`; GET/HEAD `/` serves that file, and otherwise unmatched GET/HEAD requests can serve files from `public/`. Explicit routes take precedence over file serving. Route keys are paths or a method followed by a path, such as `"GET /api/root"`. Routes match exact paths. Values can be static HTML/data or functions receiving a request. Asynchronous handlers can `await` operations and `return` their result.

| Request field | Meaning |
| --- | --- |
| `method` | HTTP method |
| `path` | URL pathname |
| `query` | Parsed query parameters |
| `headers` | Request headers |
| `body` | Parsed JSON or text request body |

Configure file locations with the optional third argument:

```arya
use std "web" as web
web.serve(3000, {}, {root: "website", html: "home.html", assets: "assets"})
```

`root` resolves from the importing source directory, or can be absolute. `html` names the entry relative to that root; it defaults to `"index.html"`. `assets` names the public asset directory and defaults to `"public"`. Asset URLs start at `/`, so `public/styles.css` is requested as `/styles.css`. Files are read per request, allowing edits without rebuilding Arya code. Public assets use file-specific content types and support HEAD requests. Directory listings, dotfiles, source files outside the public directory, traversal paths, and symlink escapes are not served.

API-only applications and inline views opt out explicitly:

```arya
use std "web" as web
web.serve(3000, {"GET /health": fn() { return {status: "ok"} }}, {html: false})
```

This is also the migration for an alpha.1 server that intentionally had no HTML file. Providing an explicit `"/"` route does not silently disable the HTML entry requirement; choose `html: false` when that is the intended application structure.

Request bodies are limited to 1 MiB. Strings are served as HTML; JSON-compatible values are serialized as JSON. Use `web.response(status, body, headers)` when you need a custom status or headers. The headers argument is optional. This helper is deliberately small: it is not an Express-compatible middleware framework.

You can still choose Express:

```arya
use js "express" as express
keep app = express()
app.get("/", fn(request, response) {
  response.send("Hello from Arya")
})
app.listen(3000)
```

Install Express in that project's `node_modules` with `npm install express`. Arya does not install dependencies automatically.

## Files, calculations, and MySQL

Node-profile standard libraries reduce boilerplate:

```arya
use std "fs" as fs
use std "math" as math

await fs.writeText("result.txt", str(math.sqrt(81)))
say(await fs.readText("result.txt"))
say(await fs.exists("result.txt"))
say(await fs.list("."))
```

The file functions are asynchronous. `math` exposes JavaScript's `Math` API. Native `use std "fs"` and `use std "math"` retain their separately documented synchronous and limited APIs.

For MySQL, install `mysql2` in your application project and connect to an existing MySQL server. The MySQL library includes verified connections, transaction callbacks, result helpers, environment configuration, and stable database error codes; see the [MySQL application guide](mysql.md) and [task API example](../fixtures/examples/mysql/README.md):

```sh
npm install mysql2
```

```arya
use std "mysql" as mysql

keep db = await mysql.connect({
  host: process.env.DB_HOST or "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
})

keep rows = await db.rows("SELECT ? AS answer", [42])
say(rows[0].answer)
await db.close()
```

`db.rows(sql, params)` returns row data directly. `db.one` returns the first row or `null`; `db.scalar` returns its first column or `null`. `db.execute(sql, params)` returns row data or a statement-result packet, without the driver's field metadata. Parameter lists are optional and default to `[]`; use placeholders for values. `db.transaction(async fn(tx) { ... })` commits related work on one dedicated connection or rolls back on failure. `db.ping()` checks connectivity; `db.close()` waits for active operations and closes the pool. The optional driver is loaded and the connection is verified when connecting, rather than during passive checking.

`use js` and `use python` remain available in the same file. Python calls use the existing synchronous JSON bridge: each call starts a fresh process, retains no Python state, and blocks while it runs. Only supported JSON-compatible arguments/results cross the bridge. Direct synchronous Python calls inside a request limit throughput. The development [async Python library](python-async.md) provides an opt-in alternative with `python.bind`/`call`/`map` and cancellation; pass `request.signal` to stop Python work when a request is cancelled. See [interop](interop.md).

The JavaScript profile also supplies `use std "path" as path`, exposing Node's path helpers, and `use std "json" as json` with `parse(text)`, `stringify(value)`, asynchronous `read(path)`, and asynchronous `write(path, value)`.

## Service operations

The service library includes `web.route` with body/query/params schemas, named route segments, request IDs, cancellation signals, structured access logging, bounded readiness checks, and `web.shutdown`. See the [service API contract](services.md) and [multi-file service example](../fixtures/examples/service/README.md). Plain function/static routes and existing HTML/asset behavior remain supported.

## Execution boundaries

Arya logic around the view runs on the server. JavaScript inside `script` runs in the visitor's browser and does not capture Arya variables, Python modules, database connections, or server secrets. A button communicates with server logic through an HTTP route, for example with browser `fetch`.

Default HTML projects serve ordinary HTML, CSS, and browser JavaScript files. Optional inline views generate those browser formats. It does not add automatic reactive updates, JSX, arbitrary inline Python/JavaScript evaluation, client-side Arya compilation, native networking, or compatibility with every web framework. Builds remain generated JavaScript modules, not a separate static-site artifact pipeline. Keep the configured HTML entry and public assets at their source locations for execution; generated JavaScript does not bundle or relocate them. Rebuild after moving a project, because source-relative locations are embedded in generated output. Check validates Arya syntax and names; it does not execute imports, connect to MySQL, or validate the contents of embedded CSS/JavaScript.
