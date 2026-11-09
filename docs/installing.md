# Install and upgrade Arya

Arya is licensed under [Apache-2.0](../LICENSE). Its npm package is `arya-language`; the commands are `arya` and `arya-lsp`. The 0.2 preview is distributed through npm's `next` tag and [GitHub prereleases](https://github.com/HamzaArya/arya-lang/releases). This guide also supports local/offline archives. The language is a development preview, with the qualification limits below.

## Requirements and tested support

Arya requires Node.js 22.15 or newer. Python is needed only for `use python` programs and Python integration tests; the CLI uses `ARYA_PYTHON`, otherwise `python` on Windows or `python3` elsewhere. The interpreter must contain the imported Python dependencies. `use js` dependencies must be installed in the source project's normal Node dependency tree.

macOS arm64, Node 22.15.0 and 24.16.0, and Python 3.13.15 have recorded local results in the roadmap. A configured Linux/Windows CI job is a test plan, not a passing result. No Linux/Windows results were available as of 9 November 2026. Check the candidate's [release-readiness record](release-readiness.md) before relying on a platform claim.

## Install in one project

Start in the folder that will contain your Arya source files:

```sh
npm init -y
npm install --save-exact arya-language@0.2.0-alpha.3
npx --no-install arya --version
```

Use `arya-language@next` to select the current public preview, or pin an exact version as above for reproducible projects. Preview changes can require migration; read the matching release notes before upgrading.

For a downloaded or locally built archive, replace the path with the actual file you received:

```sh
npm init -y
npm install --save-exact "/absolute/path/to/arya-language-<version>.tgz"
npx --no-install arya --version
```

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

For arguments, use `npx --no-install arya run main.arya -- "literal argument"`. Read them through the Arya `args` list. Flags after the module path belong to the program rather than Node.

## Work across several files

With a module-capable candidate, place dependencies below the entry file's directory:

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
3. Install that exact archive with `npm install --save-exact "/absolute/path/to/arya-language-<new-version>.tgz"`.
4. Check `npx --no-install arya --version`, run Check on the entry file, and run the project's tests/examples.
5. Rebuild generated output. Do not mix a new generated module with an older map.

To roll back, reinstall the previous retained archive and rebuild from source. Keep its lockfile if exact npm dependencies matter. Generated `.arya` directories are disposable build artifacts; retain original `.arya`, `.mjs`, and `.py` source and the project's dependency manifests.

## Uninstall

For a project-local installation, run `npm uninstall arya-language` in that project. For a global installation, run `npm uninstall --global arya-language`. Remove an installed editor extension through that editor's normal extension manager. Those operations do not intentionally delete your source files.

## Offline and isolated installations

A supplied Arya tarball contains bundled compiler/CLI/LSP runtime code; installing it from a local path does not require access to the source repository. Use `npm install --offline --ignore-scripts --no-audit --no-fund "/absolute/path/to/arya-language-<version>.tgz"` in a fresh project with a package manifest. This does not supply third-party JavaScript packages, Python, or Python packages; transfer/install those separately through the chosen ecosystem's supported offline process.

Verify an archive against a checksum received with the same reviewed release. On macOS/Linux, use `shasum -a 256 <archive>` or `sha256sum <archive>` as available; on PowerShell use `Get-FileHash <archive> -Algorithm SHA256`. A matching checksum verifies bytes against that record; it does not settle ownership, licensing, or authenticity of an untrusted download source.

For a source checkout, `npm ci` may need registry access or a populated npm cache for development dependencies. That differs from installing the already bundled archive. The [release process](releasing.md) and [readiness audit](release-readiness.md) cover clean-install acceptance and candidate provenance.
