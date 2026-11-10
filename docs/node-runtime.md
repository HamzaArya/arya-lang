# Node.js runtime and migration

Arya focuses on one purpose: readable application code that connects JavaScript/npm and Python, with useful server, database, UI, and desktop tools.

**Source candidate: 1.3.0-alpha.2.** This source line compiles `.arya` files to JavaScript ES modules and runs them on Node.js 22.15+. The latest verified npm publication remains **1.2.0-alpha.4**. A source change or Git push does not replace that immutable package.

## What remains available

- Arya syntax, modules, closures, async functions, optional access, and nullish defaults.
- JavaScript/npm imports and synchronous or opt-in asynchronous Python calls.
- HTTP APIs, validation, structured logs, MySQL pools/transactions, and controlled shutdown.
- UI components, browser state/forms, animations, and the preview/implementation guide.
- Electron desktop apps, editor colors/icons/themes, LSP, and source-mapped errors.

Node.js is the runtime, while Arya defines its own source grammar and compiler behavior. Python is required only when calling Python. Electron supplies the runtime and window for packaged desktop applications; it does not require an Arya native compiler.

## Try the candidate

From this checkout:

```sh
npm ci
npm run build
node dist/cli.cjs --version
node dist/cli.cjs run fixtures/arya/hello.arya
```

Create a portable UI project using a candidate archive. On the first packaging run in this checkout:

```sh
npm run package:editors
node dist/create.cjs my-ui --template ui --compiler artifacts/arya-language-1.3.0-alpha.2.tgz
cd my-ui
npm install
npm run dev
```

Packaging refuses to replace existing versioned archives. Reuse the matching retained candidate archive or use `npm run test:clean` to build a fresh disposable snapshot. A creator without `--compiler` pins its source version from npm, so registry installation of this candidate requires a separate publication first.

For the published baseline, `npm create arya-language@latest my-ui -- --template ui` continues to work. Its version and available wizard choices remain those of the published package.

## Removed native surface

The 1.3 candidate retires the C11 backend/runtime, Arya-written standalone compiler/bootstrap, native benchmark/workflow/fixtures, native project template, and `arya-language/native` export. Built-in editor target/C compiler settings are removed. The active templates are `web`, `api`, `cli`, `ui`, and `desktop`.

| Earlier usage | Node.js replacement |
| --- | --- |
| `arya run main.arya --target native` | `arya run main.arya` |
| `arya check main.arya --target native` | `arya check main.arya` |
| `arya build main.arya --target native -o app` | `arya build main.arya`; use the printed JavaScript entry path |
| `use std "io"` printing | `say(...)` or `print(...)` |
| Native file helpers | Async `use std "fs"` or `use js "node:fs/promises"` |
| Native process/environment helpers | `use std "env"`, `use js "node:process"`, or `use js "node:child_process"` |
| `aryaLanguage.target` / `aryaLanguage.ccPath` | Remove those obsolete editor settings |
| `checkNativeProject` / `writeNativeProject` | `checkProject` / `buildProject` / `writeProject` from `arya-language/project` |

Native-only files, process calls, and memory/runtime helpers need deliberate source migration; they do not have identical Node signatures. There is no current `std "io"`, `std "process"`, or `std "runtime"` library. Unknown standard imports report `ARYA_UNKNOWN_LIBRARY` consistently in compiler/editor analysis.

Native CLI options (`--cc`, `--debug`, `--release`, `--sanitize`, `-o`, `--output`) now fail with migration help. `--target js` remains accepted for older Node callers, but other target values are rejected. Public project/analysis APIs likewise reject unsupported target requests with `ARYA_UNSUPPORTED_TARGET`. Literal program arguments such as `--cc` can still be passed after `arya run main.arya --`.

`arya build` writes a `.mjs` module and adjacent source map under `.arya/build`; it does not create a standalone machine-code executable or desktop installer. Distribution must provide Node.js or a suitable application runtime.

## Historical native work

The implementation remains in [Git history at 1d3d553](https://github.com/HamzaArya/arya-lang/tree/1d3d553826f6dc1f67c6a1f9a7a9f8955a23cfda). Earlier native releases, checksums, and qualification records retain their original scope. They are historical artifacts, not supported targets of the 1.3 source line. See the [candidate release notes](releases/1.3.0-alpha.2.md).
