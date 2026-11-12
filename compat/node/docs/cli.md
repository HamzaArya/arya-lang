# Arya command-line reference

This reference describes the **1.3.0-alpha.4 source candidate**, which runs on Node.js 22.15+. For installation, use [the installation guide](installing.md); for an unpublished candidate, follow [candidate setup](node-runtime.md#try-the-candidate).

Commands below assume a project-local compiler, invoked with `npx --no-install arya`. From a built source checkout, substitute `node dist/cli.cjs` for that prefix. A global installation also exposes `arya` directly.

## Commands

| Command | Behavior |
| --- | --- |
| `arya --help` | Print command usage. Running `arya` without a command also prints help. |
| `arya --version` | Print the compiler version, for example `Arya 1.3.0-alpha.4`. |
| `arya check main.arya` | Read and validate the contained Arya module graph without writing output or executing imports. |
| `arya check main.arya --json` | Report Check results as one JSON object on stdout. |
| `arya build main.arya` | Compile and publish the complete graph; print the absolute generated entry path. |
| `arya run main.arya -- arguments` | Build the graph, then execute its entry with source maps enabled. |
| `arya create [directory] [options]` | Create a project; defaults to `my-arya-app` when questions are bypassed. |
| `arya init [directory] [options]` | Create a project; defaults to the current directory when questions are bypassed. |
| `arya editor status` | Locate bundled assets and supported editor launchers. |
| `arya editor path` | Print the bundled VSIX path. |
| `arya editor install` | Install the bundled extension into detected supported editors. |

Run/check/build require a `.arya` entry path. They resolve Arya imports relative to their importer and contain the graph inside the canonical entry directory. Put the entry at a common parent when modules live in sibling folders. The command does not install JavaScript or Python dependencies.

## Run and pass arguments

```sh
npx --no-install arya run main.arya -- "Arya learner" --json
```

The program receives `args` as `["Arya learner", "--json"]`. Everything after `--` is literal program input, including names that resemble compiler flags. Node runtime flags cannot be passed through this list.

Ordinary arguments directly after the file also work, but the CLI recognizes compatibility/retired compiler flags until the first unrecognized argument. Use `--` consistently to avoid ambiguity. Program arguments are accepted only by `run`.

Run inherits the terminal's working directory and environment, forwards SIGINT/SIGTERM to its child, and waits for it. Normal child completion returns the child's exit code; a SIGINT termination without an exit code returns 130, and other signal terminations return 1. Compilation/invocation failures return 1. Successful help, Check, and Build return 0.

## Build output and standalone execution

For `arya build app/main.arya`, output lives under `app/.arya/build/`:

```text
app/
  main.arya
  lib/helpers.arya
  .arya/build/
    main.arya.mjs
    main.arya.mjs.map
    lib/helpers.arya.mjs
    lib/helpers.arya.mjs.map
```

Launch the built entry with:

```sh
node --enable-source-maps app/.arya/build/main.arya.mjs "Arya learner"
```

Build replaces its owned generated graph after all modules validate. Keep unrelated files out of `.arya/build`; an unowned file or symlink can make publication fail. A failed Check/Build/Run does not execute a previous build. Source maps embed the original source text and must stay beside their modules for mapped traces.

The output requires Node.js and the application's npm dependencies. Local JavaScript/Python paths and web asset roots refer to original source locations. Keep those helpers/assets available and rebuild after moving the project. Build does not bundle npm packages, Python, HTML/assets, Node.js, or a desktop installer. See [module semantics](arya-specification.md#11-arya-modules-and-build-graphs) and [web execution boundaries](arya-web.md#execution-boundaries).

## Check reports

```sh
npx --no-install arya check main.arya --json
```

Success has `{ok:true, command:"check", file, target:"js", diagnostics:[]}`. Source failures have `ok:false` and diagnostics with file, code, message, one-based line/column, zero-based UTF-16 start/end offsets, optional hint/suggestion, and available fixes. An early invocation error uses `ARYA_CLI` and can omit source fields. Exit status is 1 for either failure. See [diagnostics and fixes](syntax-and-debugging.md#diagnose-before-running).

Check validates direct Arya namespace exports. It does not load npm/Python modules, check dynamic properties or types, validate browser files, or simulate temporal-dead-zone initialization at runtime.

## Project creation options

| Option | Behavior |
| --- | --- |
| `--template web\|api\|cli\|ui\|desktop` | Choose one template without the type-selection prompt. |
| `--web` | Shortcut for the web template, including `arya init my-app --web`. |
| `--yes` / `-y` | Skip questions; choose web unless a template is supplied. |
| `--compiler /path/to/compiler.tgz` | Validate and vendor a matching compiler archive. |
| `--help` / `--version` | Print creator help or `Arya creator <version>`. |

Without a template or `--yes`, creation asks for a directory (if omitted) and template. Existing nonempty directories and symlink targets are refused. Creation writes files and prints next steps; run `npm install` yourself. The candidate creator pins its own compiler version, so an unpublished version needs `--compiler`. See [project creation](project-creator.md) for npm initializer syntax and portable projects.

## Editor options and Python selection

All three editor commands accept `--json`. Only `editor install` accepts `--editor`, `--cli`, `--extensions-dir`, `--user-data-dir`, and `--force`; see [editor setup](editor-setup.md) for supported editor names and installation behavior. `arya-lsp --stdio` is a separate executable started by an LSP client.

Set `ARYA_PYTHON` to select the Python executable for direct calls and the async bridge's default client. Otherwise the platform default is `python3` on Unix or `python` on Windows. Async client/call options can override it. See [Python environments](python-async.md#managed-clients-and-python-environments).

## Retired options

`--target js` and `--target=js` remain compatibility spellings. Other targets and native flags `--cc`, `--debug`, `--release`, `--sanitize`, `-o`, and `--output` fail with migration help. Use [the Node.js migration guide](node-runtime.md) when upgrading native programs. To pass any of these words to your program, put them after `--`.

## Business candidate commands

`arya fmt file.arya [--check]`, `arya lint file.arya` and `arya test file.test.arya` are available in alpha.5. See [contracts and tested examples](business-applications.md#build-tests-and-tooling).

The unreleased source candidate adds [`use std "testing"`](testing-library.md) for suites, hooks, strict assertions, and mocks. `arya test` accepts one explicit entry, compiles imported Arya modules, and runs Node's test runner with source maps and a failing exit status for failed tests.

## Native scalar preview

The unpublished alpha.12 candidate adds `arya native file.arya --output executable [--debug|--release] [--compiler clang++] [--sanitize]`. It requires an explicit new output path and a host Clang C++17 toolchain. See the [supported subset and API](native-preview.md). Default `build`/`run` and legacy target-option behavior remain as documented above.
