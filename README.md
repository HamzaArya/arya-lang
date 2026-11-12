# Arya

Arya is a native programming language with exact decimal calculations, HTTP applications, and a self-hosted compiler. Arya source compiles through C11 into ordinary executables. The compiler, language server, formatter, project creator, test runner, and standard libraries use the native toolchain.

```sh
make native-editor
./bin/arya create prices --template cli
./bin/arya run prices/main.arya -- 19.95 3
./bin/arya build prices/main.arya -o ./prices-app --release
./prices-app 19.95 3
```

The complete SDK includes compiled crypto, HTTP, URL and regex libraries, standard modules, and the native editor extension. A source build needs a POSIX shell, make and C11 compiler; the URL library needs C++20 and OpenSSL's build configuration needs Perl. Building and running Arya require no Node, npm or Python. Explicit Python interoperability needs its own interpreter. MySQL applications use an installed MySQL C client SDK. Desktop windows currently use macOS AppKit/WebKit.

Use `number` for ordinary binary64 calculations and decimal strings for money:

```arya
use std "accounting" as accounting
let result = accounting.invoiceBatch(
  [{price: "19.95", quantity: "2", discountBps: 1000, taxBps: 750}],
  {currency: "AFN", scale: 2, rounding: "half-even"}
)
print(result.total) # 38.60
```

`arya create` provides `cli`, `web`, `api`, `ui` and `desktop` projects. Use `arya editor install --editor code` to install the bundled editor extension, or connect another LSP client to `arya lsp --stdio`. The extension uses the editor's existing host; all Arya analysis runs in the native executable.

Read the [SDK guide](docs/native-sdk.md), [language profile](docs/native-profile.md), [standard library](docs/standard-library.md), [accounting API](docs/accounting-engine.md), and [qualification report](docs/native-independence-report.md). Platform qualification and resource limits are recorded in [native/manifest.json](native/manifest.json). This is an alpha language; platform ports and the broader ecosystem roadmap have separate acceptance criteria.

The previous Node implementation, npm tooling and editor are preserved in [compat/node](compat/node/README.md). The native build does not use them. Existing Arya Ledger installations and data remain separate; the native [financial worker](native/examples/calculation-worker.arya) provides an opt-in JSON-lines integration.

Arya is licensed under [Apache-2.0](LICENSE). Bundled dependencies retain their own terms in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
