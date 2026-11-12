# Arya programming language

The **2.0 native migration** now has an independent, self-hosted compiler and core
runtime. Build it with `make native`, run `bin/arya`, and verify with
`make native-test`. These paths require no Node, npm or Python. Read the
[native guide](docs/native-independence.md) and [function port table](native/manifest.json)
for supported features and remaining work. Full standard-library conversion is
still in progress. The 1.3 Node compatibility workflow below remains available
for existing consumers during migration.


New here? Follow the [first useful program and mixed JavaScript workflow](docs/getting-started.md).
Arya brings JavaScript/npm libraries, Python functions, servers, and interfaces together through readable `.arya` code. Created by Afghan developer [Hamza Arya](https://hamzaarya.com), it has its own grammar, compiler, language server, and editor support.

<!-- release-status:start -->
Published experimental preview: **1.3.0-alpha.9**, compiler and creator on npm’s `next` channel; editor extension **1.3.4**. The recorded release passed **12** Linux/Windows/macOS jobs on Node 22.15.0, 22, 24, 26. See the [publication record](docs/releases/1.3.0-alpha.9-publication.json). This evidence describes the published artifacts; subsequent source changes require separate qualification.
<!-- release-status:end -->

## Start a project

Requires **Node.js 22.15 or newer** and npm:

```sh
npm create arya-language@1.3.0-alpha.9 my-app -- --template web
cd my-app
npm install
npm run dev
```

The commands above pin the current published preview. `@latest` still selects the older 1.2 release. To try unpublished changes from this checkout, follow [candidate setup](docs/node-runtime.md#try-the-candidate). The current creator offers these five templates:

| Template | What you get |
| --- | --- |
| `web` | Arya server, `index.html`, and separate CSS/browser JavaScript |
| `api` | JSON endpoints without an HTML entry |
| `cli` | A command-line program with arguments |
| `ui` | Arya components, forms, browser state, API actions, and animations |
| `desktop` | The same UI application in an isolated Electron window |

For example, `npm create arya-language@1.3.0-alpha.9 my-ui -- --template ui` creates a UI application. Starters pin the compiler and include `dev`, `start`, `check`, and `build` scripts. See [project creation](docs/project-creator.md) and [installation](docs/installing.md), including portable archive installation.

## Read application code from top to bottom

The source candidate adds pipelines, short functions with defaults/rest parameters, checked guards, indexed loops, reliable cleanup, and collection helpers:

```arya
use std "list" as list

fn label(person, position = 0) => str(position + 1) + ". " + person.name

const people = [{name: "Hamza", active: true, score: 85}]
const leaders = people
  |> list.filter("active")
  |> list.sortBy("score", "desc")
  |> list.take(3)

for person at position in leaders {
  print(label(person, position))
}
```

These forms were added in 1.3.0-alpha.2 and are included in the current source candidate; the published 1.2 baseline does not support them. Read the [syntax guide](docs/flow-syntax.md) or run the [data-flow example](fixtures/examples/data-flow/README.md). Use canonical `const`, `fn`, `return`, `if`/`else`, `for`, and `print`. The alpha.4 candidate removes alternate spellings; see [syntax migration](docs/syntax-migration.md). Older bindings named `guard` also need renaming.

## Use JavaScript and Python together

```arya
use js "node:crypto" as crypto
use python "statistics" as statistics
use std "python" as python

const stats = python.bind(statistics)
const mean = await stats.mean([10, 20, 30])

print({id: crypto.randomUUID(), mean: mean})
```

Install the compiler with `npm install --save-exact arya-language@1.3.0-alpha.9`, save the example as `main.arya`, and run `npx --no-install arya run main.arya`. Python is required for this example. Install additional npm and Python libraries in the application's respective environments.

Direct Python calls remain synchronous. The async library adds bound imports, keyword arguments, batches, cancellation, bounded queues, and interpreter selection. See [interop](docs/interop.md), [async Python](docs/python-async.md), and the [reporting service example](fixtures/examples/python-web/README.md).

## Build useful applications

| Goal | Guide |
| --- | --- |
| Learn the language | [Tutorial](docs/arya-tutorial.md), [task-report project](docs/learning-path.md), [reference](docs/arya-language.md) |
| Build a server | [Web applications](docs/arya-web.md), [validation, logs, and shutdown](docs/services.md) |
| Protect application data | [Security library](docs/security-library.md): passwords, tokens, HMAC, and encryption (unreleased) |
| Test an application | [Testing library](docs/testing-library.md): suites, assertions, hooks, and mocks (unreleased) |
| Connect a database | [MySQL pools, prepared queries, and transactions](docs/mysql.md) |
| Calculate exact invoice and ledger batches | [Small accounting runtime with an optional native kernel](docs/accounting-engine.md) (unreleased prototype) |
| Build an interface | [UI and desktop apps](docs/ui-apps.md), [component and animation reference](docs/ui-library.md) |
| Find and fix errors | [Safer expressions, code frames, Quick Fixes, and debug helpers](docs/syntax-and-debugging.md) |
| Build an experimental native executable | [Native scalar preview](docs/native-preview.md), with explicit supported syntax and toolchain requirements |
| Embed the compiler | [Compiler, language-service, project, and editor APIs](docs/compiler-api.md) |
| Use the terminal | [Commands, arguments, JSON reports, and build output](docs/cli.md) |

The UI library includes an interactive component gallery, eight reusable page sections, four full-page templates, a motion playground, and an implementation guide. The [sections and templates guide](docs/ui-patterns.md) covers landing pages, dashboards, settings, and sign-in interfaces. From a source checkout, run `npm run ui:preview` and open **http://127.0.0.1:3040**. Applications can serve the same pages with `ui.preview()`.

## Enable editor support

The npm package includes an offline extension, `.arya` icons, Arya Dark/Light themes, semantic highlighting, and portable editor adapters:

```sh
npm install --save-exact arya-language@1.3.0-alpha.9
npx --no-install arya editor install
```

This installs into detected supported VS Code-compatible editors, including VS Code and AryaCode. Reload the editor and open **Arya: Editor Setup Guide** to choose icons and themes. npm installation itself does not change editor preferences. Other editors can use `arya-lsp --stdio` and the supplied adapters. See [editor setup](docs/editor-setup.md) and [editor compatibility](docs/arya-editors.md).

## Work on the repository

```sh
npm ci
npm run check
npm run ui:preview
```

The full suite additionally needs Python. A C++ compiler is needed only for the explicit optional accounting kernel build. MySQL, Chrome, Electron, and editor-host checks have separate setup. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the source layout, commands, and validation workflow. Release packaging must preserve already published archives; follow the [release process](docs/releasing.md).

The [architecture audit](docs/architecture-audit.md), [target architecture](docs/architecture-target.md), and [staged implementation roadmap](docs/implementation-roadmap.md) track the native compiler and financial ecosystem. The independent 2.0 compiler uses a C11 native backend; its [migration report](docs/native-independence-report.md) records verified features and remaining ports. The retained 1.3 workflow uses Node.js and includes the earlier scalar LLVM preview.

## Documentation and release status

Start at the [documentation index](docs/README.md). Changes are listed in the [changelog](CHANGELOG.md); exact npm hashes and public-install verification are in the [publication record](docs/releases/1.3.0-alpha.9-publication.json).

The [stable release plan](docs/stable-release-plan.md) defines the compatibility contract, remaining qualification work, and requirements for a future 1.3.0 release. Unreleased source improvements are listed separately in the changelog and require a new artifact version.

This checkout adds [project-wide editor analysis, stronger type boundaries, compiler improvements and performance measurements](docs/editor-and-compiler-improvements.md). These source changes are unreleased. External learner review, Electron installers and broader editor/platform qualification remain open; see the [roadmap](docs/arya-roadmap.md).

Licensed under [Apache-2.0](LICENSE), copyright 2026 Hamza Arya. Retain [NOTICE](NOTICE) and [third-party notices](THIRD-PARTY-NOTICES.txt) in distributions. Report vulnerabilities through [SECURITY.md](SECURITY.md).
