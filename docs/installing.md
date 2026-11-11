# Install and upgrade Arya

Arya is licensed under [Apache-2.0](../LICENSE). Its npm package is `arya-language`; the commands are `arya` and `arya-lsp`. The last verified npm publication recorded here is **1.2.0-alpha.4**, published on 10 November 2026 with the `latest` tag. It includes UI/desktop starters and bundled editor support. It remains an experimental alpha; see the [release notes](releases/1.2.0-alpha.4.md) for scope and compatibility.

## Requirements and tested support

The npm compiler and default JavaScript target require Node.js 22.15 or newer. The current source candidate, 1.3.0-alpha.4, uses Node.js only and requires no C compiler; see [runtime and migration](node-runtime.md). Python is needed only for `use python` programs and Python integration tests; the CLI uses `ARYA_PYTHON`, otherwise `python` on Windows or `python3` elsewhere. The interpreter must contain the imported Python dependencies. `use js` dependencies must be installed in the source project's normal Node dependency tree.

macOS arm64, Node 22.15.0 and 24.16.0, and Python 3.13.15 have recorded local results in the roadmap. A configured Linux/Windows CI job is a test plan, not a passing result. Fresh Linux/Windows results for alpha.4 were not part of its npm qualification; earlier-version CI is historical evidence. Check the candidate's [release-readiness record](release-readiness.md) before relying on a platform claim.

## Install in one project

Install the current preview directly from npm:

```sh
npm init -y
npm install --save-exact arya-language@1.2.0-alpha.4
npx --no-install arya --version
```

The CLI identifies `Arya 1.2.0-alpha.4`. To create a new application interactively, use `npm create arya-language@1.2.0-alpha.4`, then run `npm install` and `npm run dev` inside the created folder. Registry installation uses matching compiler and creator versions; no repository checkout or archive transfer is required. `@latest` follows the registry tag, which may move after this publication record.

The [release notes](releases/1.2.0-alpha.4.md) describe compatibility; the [publication record](releases/1.2.0-alpha.4-publication.json) verifies registry hashes and a fresh public install. Local/offline archive installation remains available as described below.

`arya-language@latest` selects whichever public preview the registry tag currently names; it can change when a new release is selected. Pin the intended archive or published version for reproducible projects. Read the matching release notes before upgrading.

Use the version in the filename, package metadata, and the CLI output together. This installs a local compiler without a repository checkout or a global install. `npx --no-install` uses the compiler already installed in this project.

Create `main.arya`:

```arya
print("Hello from Arya")
```

Then run:

```sh
npx --no-install arya check main.arya
npx --no-install arya run main.arya
npx --no-install arya build main.arya
node --enable-source-maps .arya/build/main.arya.mjs
```

Check prints `Check OK` and never executes imports. Run and standalone execution print `Hello from Arya`. Build prints its generated entry path and writes source maps alongside the generated modules. Keep those maps with the output when diagnosing failures. The maps contain a copy of the original source text.

For arguments, use `npx --no-install arya run main.arya -- "literal argument"`. Read them through the Arya `args` list. Everything after `--` belongs to the program. The candidate CLI still recognizes compatibility/retired compiler flags between the file and `--`; see the [command reference](cli.md#run-and-pass-arguments).

## Create a project interactively

With the compiler installed:

```sh
npx --no-install arya create
```

The current source candidate offers web, API, CLI, UI, and Electron desktop applications. The published baseline also offers the older native template, retired in 1.3. The generated `package.json` pins Arya and supplies `npm run dev`, `check`, `start`, and `build` scripts. Web apps use one `index.html` containing `div#root`; browser code renders the interface there. New flow syntax and UI sections/templates require [candidate setup](node-runtime.md#try-the-candidate).

The pinned registry entry is `npm create arya-language@1.2.0-alpha.4`. npm install arya-language remains a normal compiler installation and does not ask project-creation questions automatically.

For an offline project or an unpublished future candidate, supply a matching compiler archive:

```sh
npx --no-install arya create my-app --template web --compiler /path/to/arya-language-1.2.0-alpha.4.tgz
cd my-app
npm install
npm run dev
```

The archive is copied into vendor/ and referenced relatively, so the generated project can be moved to another machine before installing dependencies. See the [project creator guide](project-creator.md).

## Work across several files

Place dependencies below the entry file's directory:

```text
project/
  main.arya
  lib/greeting.arya
```

```arya
# lib/greeting.arya
export fn greeting(name) {
  return "Hello, " + name
}
```

```arya
# main.arya
use arya "./lib/greeting.arya" as messages
print(messages.greeting("Arya"))
```

Run `npx --no-install arya run main.arya` from `project`. Imports use relative paths and an explicit `.arya` extension. The entry directory is the project boundary; dependencies cannot escape it through `..` or symlinks. JavaScript and Python dependencies remain their own ecosystems and do not become Arya registry packages.

## Optional global installation

```sh
npm install --global "/absolute/path/to/arya-language-<version>.tgz"
arya --version
```

The npm global executable directory must be on PATH. On Windows, PowerShell execution policy can affect npm's `.ps1` command shim; the `.cmd` shim or a direct Node invocation can be used under the machine's existing policy. A local project installation is preferable when different projects use different compiler versions.

To bypass shell shims in a local installation:

```sh
node node_modules/arya-language/dist/cli.cjs --version
node node_modules/arya-language/dist/cli.cjs run main.arya
```

## Other editors and AryaCode

Use the [editor guide](arya-editors.md) for the local VSIX and LSP configuration. The portable server command is `arya-lsp --stdio`, or `node node_modules/arya-language/dist/lsp.cjs --stdio`. A server waiting for protocol messages will not display a terminal prompt.

AryaCode installs its own pinned compiler archive. Installing a different compiler into a project does not change AryaCode's embedded package. Update the IDE pin and rebuild through its documented integration workflow. Keep Arya language versions separate from AryaCode product versions.

## Upgrade and roll back

1. Save or commit your source and dependency lockfile.
2. Read the target version's release notes and migration examples.
3. Install the exact registry version with `npm install --save-exact arya-language@<new-version>`, or the reviewed archive with `npm install --save-exact "/absolute/path/to/arya-language-<new-version>.tgz"`. Unpublished candidates require an archive.
4. Check `npx --no-install arya --version`, run Check on the entry file, and run the project's tests/examples.
5. Rebuild generated output. Do not mix a new generated module with an older map.

To roll back, reinstall the previous retained archive and rebuild from source. Keep its lockfile if exact npm dependencies matter. Generated `.arya` directories are disposable build artifacts; retain original `.arya`, `.mjs`, and `.py` source and the project's dependency manifests.

## Uninstall

For a project-local installation, run `npm uninstall arya-language` in that project. For a global installation, run `npm uninstall --global arya-language`. Remove an installed editor extension through that editor's normal extension manager. Those operations do not intentionally delete your source files.

## Offline and isolated installations

A supplied Arya tarball contains bundled compiler/CLI/LSP runtime code; installing it from a local path does not require access to the source repository. Use `npm install --offline --ignore-scripts --no-audit --no-fund "/absolute/path/to/arya-language-<version>.tgz"` in a fresh project with a package manifest. This does not supply third-party JavaScript packages, Python, or Python packages; transfer/install those separately through the chosen ecosystem's supported offline process.

Verify an archive against a checksum received with the same reviewed release. On macOS/Linux, use `shasum -a 256 <archive>` or `sha256sum <archive>` as available; on PowerShell use `Get-FileHash <archive> -Algorithm SHA256`. A matching checksum verifies bytes against that record; it does not settle ownership, licensing, or authenticity of an untrusted download source.

For a source checkout, `npm ci` may need registry access or a populated npm cache for development dependencies. That differs from installing the already bundled archive. The [release process](releasing.md) and [readiness audit](release-readiness.md) cover clean-install acceptance and candidate provenance.
