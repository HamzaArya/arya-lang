# Arya programming language

Arya brings JavaScript/npm libraries, Python functions, servers, and interfaces together through readable `.arya` code. Created by Afghan developer [Hamza Arya](https://hamzaarya.com), it has its own grammar, compiler, language server, and editor support.

**Current source: [1.3.0-alpha.1](docs/releases/1.3.0-alpha.1.md)** — a Node.js-only candidate. The latest published npm release is [1.2.0-alpha.4](docs/releases/1.2.0-alpha.4.md). The new runtime focus removes the native compiler; see [runtime and migration](docs/node-runtime.md). Arya remains experimental.

## Start a project

Requires **Node.js 22.15 or newer** and npm:

```sh
npm create arya-language@latest my-app -- --template web
cd my-app
npm install
npm run dev
```

The commands above use the published npm baseline. To try the Node.js-only candidate from this checkout, follow [candidate setup](docs/node-runtime.md#try-the-candidate). Its creator offers these five templates:

| Template | What you get |
| --- | --- |
| `web` | Arya server, `index.html`, and separate CSS/browser JavaScript |
| `api` | JSON endpoints without an HTML entry |
| `cli` | A command-line program with arguments |
| `ui` | Arya components, forms, browser state, API actions, and animations |
| `desktop` | The same UI application in an isolated Electron window |

For example, `npm create arya-language@latest my-ui -- --template ui` creates a UI application. Starters pin the compiler and include `dev`, `start`, `check`, and `build` scripts. See [project creation](docs/project-creator.md) and [installation](docs/installing.md), including portable archive installation.

## Use JavaScript and Python together

```arya
use js "node:crypto" as crypto
use python "statistics" as statistics
use std "python" as python

const stats = python.bind(statistics)
const mean = await stats.mean([10, 20, 30])

say({id: crypto.randomUUID(), mean: mean})
```

Install the compiler with `npm install arya-language@latest`, save the example as `main.arya`, and run `npx --no-install arya run main.arya`. Python is required for this example. Install additional npm and Python libraries in the application's respective environments.

Direct Python calls remain synchronous. The async library adds bound imports, keyword arguments, batches, cancellation, bounded queues, and interpreter selection. See [interop](docs/interop.md), [async Python](docs/python-async.md), and the [reporting service example](fixtures/examples/python-web/README.md).

## Build useful applications

| Goal | Guide |
| --- | --- |
| Learn the language | [Tutorial](docs/arya-tutorial.md), [task-report project](docs/learning-path.md), [reference](docs/arya-language.md) |
| Build a server | [Web applications](docs/arya-web.md), [validation, logs, and shutdown](docs/services.md) |
| Connect a database | [MySQL pools, prepared queries, and transactions](docs/mysql.md) |
| Build an interface | [UI and desktop apps](docs/ui-apps.md), [component and animation reference](docs/ui-library.md) |
| Find and fix errors | [Safer expressions, code frames, Quick Fixes, and debug helpers](docs/syntax-and-debugging.md) |
| Embed the compiler | [Compiler, language-service, project, and editor APIs](docs/compiler-api.md) |

The UI library includes an interactive component gallery, motion playground, copyable examples, and an implementation guide. From a source checkout, run `npm run ui:preview` and open **http://127.0.0.1:3040**. Applications can serve the same pages with `ui.preview()`.

## Enable editor support

The npm package includes an offline extension, `.arya` icons, Arya Dark/Light themes, semantic highlighting, and portable editor adapters:

```sh
npm install arya-language@latest
npx --no-install arya editor install
```

This installs into detected supported VS Code-compatible editors, including VS Code and AryaCode. Reload the editor and open **Arya: Editor Setup Guide** to choose icons and themes. npm installation itself does not change editor preferences. Other editors can use `arya-lsp --stdio` and the supplied adapters. See [editor setup](docs/editor-setup.md) and [editor compatibility](docs/arya-editors.md).

## Work on the repository

```sh
npm ci
npm run check
npm run ui:preview
```

The full suite additionally needs Python. A C compiler is not required. MySQL, Chrome, Electron, and editor-host checks have separate setup. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the source layout, commands, and validation workflow. Release packaging must preserve already published archives; follow the [release process](docs/releasing.md).

## Documentation and release status

Start at the [documentation index](docs/README.md). Changes are listed in the [changelog](CHANGELOG.md); exact npm hashes and public-install verification are in the [publication record](docs/releases/1.2.0-alpha.4-publication.json).

The current release has recorded local macOS arm64 qualification. Fresh Linux/Windows qualification and external learner review remain open. Electron desktop installers, a formatter, static types, and interactive source-level debugging are separate work; see the [roadmap](docs/arya-roadmap.md) and [readiness record](docs/release-readiness.md).

Licensed under [Apache-2.0](LICENSE), copyright 2026 Hamza Arya. Retain [NOTICE](NOTICE) and [third-party notices](THIRD-PARTY-NOTICES.txt) in distributions. Report vulnerabilities through [SECURITY.md](SECURITY.md).
