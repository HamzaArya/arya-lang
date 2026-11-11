# Create an Arya project

The Arya 1.3.0-alpha.4 candidate provides five Node.js application starters. The native template is retired. See [runtime and migration](node-runtime.md) and [candidate notes](releases/1.3.0-alpha.4.md).

## Registry workflow

The recorded published baseline is 1.2.0-alpha.4. Its Node.js templates work as shown below; use [candidate setup](node-runtime.md#try-the-candidate) for the new source creator:

```sh
npm create arya-language@1.2.0-alpha.4
cd my-arya-app
npm install
npm run dev
```

The current source creator's wizard asks:

```text
Project directory (my-arya-app):

What do you want to build?
  1. Web app
  2. API server
  3. CLI tool
  4. UI app
  5. Desktop GUI

Select a project type (1):
```

The published 1.2.0-alpha.4 wizard additionally offers native CLI, so its displayed numbering differs. Prefer `--template <name>` in automation; the five names in the table below work in both versions.

Enter a number or template name. Press Enter for the displayed default. Ctrl+C cancels; EOF cancels without creating a project. Invalid template selections are prompted again. Existing/nonempty directories and symlink targets are refused, with rollback of newly created files on publication failure.

`npm create arya-language` follows npm's initializer convention and executes the separate `create-arya-language` package. `npx arya-language@latest` is another entry point through the compiler package's matching-name executable. With the compiler installed, use `arya create`. `npm install arya-language` installs a dependency normally; it does not unexpectedly launch the wizard.

Generated projects pin the exact compiler version; later changes to registry tags do not change that dependency.

## Templates

| Template | Files and behavior |
| --- | --- |
| web | main.arya server, index.html shell, public CSS/module JavaScript, and health endpoint |
| api | main.arya with health/echo JSON routes and explicit html:false; no HTML file |
| cli | main.arya greeting function with a command-line argument |
| ui | Declarative components, forms, browser state, API actions, and animations |
| desktop | The same UI application in an isolated Electron window |

Every template includes package.json, README.md, and .gitignore. package.json is private, pins the compiler version, requires Node 22.15+, and supplies dev/start/check/build scripts. Run npm install in the created folder once, then use its local compiler through those scripts. No global compiler or source checkout is needed afterwards.

The compiler is a `devDependency`; the desktop starter also places Electron there. Include development dependencies when using the generated scripts, including `start`, because they invoke the compiler. For direct execution of built output, follow the [CLI build reference](cli.md#build-output-and-standalone-execution) and retain the application's runtime dependencies, helpers, and assets. UI entries export lifecycle functions; their generated `serve.mjs` launcher starts the browser application.

For automation:

```sh
arya create my-api --template api
arya create my-tool --template cli
arya create my-site --yes
```

Use `--template ui` or `--template desktop` for components and animations written in Arya. Both support registry installation; `--compiler` is optional for portable archives. Desktop installation also downloads Electron. See the [UI application guide](ui-apps.md).

`--yes` chooses the web defaults without questions. `arya init my-site --web` remains a direct web-template shortcut; `arya init --web` initializes the current empty folder. Without a template, create/init asks for a selection.

With npm create, separate creator flags from npm flags:

```sh
npm create arya-language@1.2.0-alpha.4 my-site -- --template web
```

## Web application rendering

The default index.html body is:

```html
<body>
  <div id="root"></div>
</body>
```

The head links public/styles.css and loads public/app.js as a JavaScript module. app.js mounts the entire application inside #root; the starter's static template is trusted source, and API data is rendered with textContent. Browser controls and status/data outputs remain inside the mounted subtree. main.arya contains server functions using fn, return, const, and if/else.

This is a Vite-style project creation and mounting workflow. The starter uses vanilla browser JavaScript and Arya's Node HTTP server. It does not supply Vite, JSX, a frontend bundler, hot module replacement, or client-side Arya compilation. The build script compiles the Arya entry using its existing .arya/build output contract; it does not produce a Vite dist directory. Refresh browser assets after edits and restart after changing Arya code.

## Portable and offline projects

For offline use, retain the published archives. From a built checkout, create a project using the retained compiler archive:

```sh
node dist/create.cjs my-site --compiler artifacts/arya-language-1.3.0-alpha.4.tgz
```

Or install the creator archive without the repository:

```sh
npm install --global ./create-arya-language-1.3.0-alpha.4.tgz
create-arya-language my-site --compiler ./arya-language-1.3.0-alpha.4.tgz
```

Choose Web app when prompted. The compiler archive must identify the arya-language package and match the creator's version. It is copied to vendor/ and package.json references `file:vendor/arya-language-1.3.0-alpha.4.tgz`.

Copy the entire created folder to another machine, then:

```sh
cd my-site
npm install
npm run dev
```

Node/npm are still required. Python, additional npm/Python libraries, and Electron are separate optional dependencies. Without --compiler, installation requires the exact pinned compiler version to be available on npm.
