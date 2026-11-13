# Arya

Arya is a native programming language with a self-hosted compiler, exact-decimal libraries and application tooling. Source compiles through C11 into executables. The compiler, formatter, checker, language server, test runner and project creator run without Node.js.

The current source is **2.0.0**, undergoing stable release qualification. It adds direct native GUI widgets, binary filesystem operations, atomic file replacement and the reviewed compiler, runtime and editor improvements. Published platform support follows the [release qualification record](native/qualification/2.0.0.json).

## Start a project

From a complete source checkout or matching source snapshot:

```sh
make native-sdk
./bin/arya --version
./bin/arya create hello --template cli
./bin/arya run hello/main.arya
./bin/arya build hello/main.arya -o ./hello-app --release
./hello-app
```

An installed SDK provides `arya` directly on PATH. Source builds need POSIX tools, a C11 compiler, C++20 for the full URL library and Perl for OpenSSL configuration. No Node, npm or Python is required for native builds. Compiled applications need their target's system libraries and any explicitly selected feature dependencies.

**Installing on another computer:** use the [installation guide](docs/installing.md). It covers copying a full SDK, verifying checksums, setting PATH, building from source and deploying an application. Separate native builds target macOS, Linux and Windows with Cygwin. Each target must pass its own qualification gates before a release asset is offered; one operating system’s archive cannot run on another.

## Compose records

```arya
const currency = "AFN"
const defaults = {currency, scale: 2}
const field = "rounding"
const settings = {...defaults, [field]: "half-even"}
print(JSON.stringify(settings))
```

Fields evaluate left to right. Keys must be strings, spread accepts records only, and copies are shallow. Existing `let`, `const`, `fn`, `use`, pipelines and async syntax remain valid. Read the [language reference](docs/arya-language.md) for supported forms, typing, examples and differences from JavaScript.

Use binary64 `number` for ordinary arithmetic and explicit decimal strings/values for exact money. The SDK has [28 public standard modules](docs/standard-library.md), including [accounting](docs/accounting-engine.md), [money/finance/CSV](docs/native-finance-data.md), [authentication and native biometrics](docs/native-auth.md), and [security/debugging](docs/native-security-debugging.md). Templates cover CLI, web, API, UI and optional macOS WebKit desktop projects. The new `gui` module uses AppKit, GTK 3 or Win32 controls directly.

## Documentation and tools

- [Documentation index](docs/README.md): current guides and versioned evidence.
- [Getting started](docs/getting-started.md): create, check, format, test and build a project.
- [CLI](docs/cli.md) and [SDK](docs/native-sdk.md): command and distribution contracts.
- [Native profile](docs/native-profile.md): memory, libraries, foreign boundaries and limits.
- [Syntax update and verification](docs/native-syntax.md): alpha.3 changes and checks.
- [Contributing](CONTRIBUTING.md): source layout, bootstrap and acceptance gates.

Run `arya lsp --stdio` from a compatible editor. The optional VS Code-compatible adapter is a separate editor-host component built by `make native-editor`; it is excluded from the standalone SDK.

The [Ledger performance report](docs/native-ledger-fastpaths.md) retains the earlier compiler's measured improvements and tradeoffs. Its numbers identify specific binaries and workloads, not a universal speed claim for every later version.

Original Node-profile guides, npm tooling and source remain under [compat/node](compat/node/README.md). Redundant active copies have been removed; historical qualification and benchmark evidence is preserved. Native builds do not use the compatibility implementation. Python interoperability, a native MySQL client and macOS desktop frameworks are explicit optional features.

Arya is licensed under [Apache-2.0](LICENSE). Bundled dependencies retain their terms in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
