# Native Arya SDK

Arya's compiler, language server, formatter, test runner, project creator,
standard libraries, and generated application code use the native toolchain.
The compiler is written in Arya and generates C11 for a host C compiler.
Ordinary application execution uses native executables. Python interoperability
launches an interpreter only when the application explicitly uses that bridge.

Keep `lib`, `stdlib`, and optional `share` alongside `arya`. Add the SDK directory
to PATH, or invoke its executable directly. Executable symlinks resolve SDK
resources through the canonical binary location.

```sh
./arya create prices --template cli
cd prices
/path/to/sdk/arya run main.arya -- 19.95 3
/path/to/sdk/arya build main.arya -o ./prices --release
./prices 19.95 3
```

The creator also provides `web`, `api`, `ui`, and `desktop` templates. Web and UI
applications serve browser content from a native HTTP backend. The macOS desktop
template uses an AppKit/WebKit window and the same native routes. Network
templates drain on SIGINT/SIGTERM. A second signal can terminate a process whose
one-shot cleanup is still running.

`arya run` reuses its own unchanged output after comparing the generated C,
toolchain configuration, SDK metadata, and binary identity. Source or build
input changes cause a rebuild. Explicit output paths require `--force` to replace
existing outputs. Generated `.c` and `.NOTICE` files accompany executables.

## Editor

`arya editor path` prints the packaged VSIX location. Use
`arya editor install --editor code` for Visual Studio Code, or choose
`aryacode`, `cursor`, `codium`, or `windsurf` when their launchers are installed.
`arya editor status --json` reports launchers without installing anything.

The extension includes a native SDK and calls `arya lsp --stdio`. Its JavaScript
file is editor-host transport; the editor supplies that host. Set
`arya.compilerPath` to override the bundled native executable. Run and Check use
the native executable directly. Analysis never executes project imports.

## Numbers and foreign values

Ordinary `number` values are IEEE 754 binary64. Currency and financial values
use canonical decimal strings and `std "decimal"`. Rounding is explicit.
The MySQL bridge preserves DECIMAL and BIGINT as strings. Validate external
JSON/Python values with schemas before assigning concrete types. Direct Python
imports can declare a function contract after the alias; that declaration is a
trusted interoperability boundary. Exact values crossing JSON boundaries should
remain strings.

`calculation-worker.arya` supplies the native JSON-lines financial protocol.
Existing Arya Ledger data and pinned 1.3 packages are outside this SDK's migration;
the worker permits an application in another language to call native calculations.

## Build requirements and profile

A source build of the compiler needs a POSIX shell, make, and a C11 toolchain.
`make native-sdk` also builds the vendored crypto, HTTP, URL and regex libraries.
Ada URL needs C++20. OpenSSL uses Perl for its upstream build configuration.
Neither JavaScript nor Python is a build dependency. The SDK contains compiled
libraries and headers for building applications without those source-build steps.

MySQL support requires its native C client installation (`ARYA_MYSQL_PREFIX`).
The explicit Python bridge accepts `ARYA_PYTHON` or an interpreter option.
Desktop support currently targets macOS. Platform qualification and detailed
limits are recorded in `manifest.json`.

This is a native language profile. Node package imports and JavaScript module
output belong to the separately retained 1.3 compatibility implementation.
Native RegExp uses bounded PCRE2 semantics; host-style Buffer/Date/Map APIs are
documented compatibility subsets, rather than a complete JavaScript environment.
Decimal input/output is bounded to 1024 characters, with 4096 context digits and
0–100 output places. Runtime strings are limited to 16 Mi UTF-16 units. The
cooperative scheduler supports at most 512 tasks; async callbacks must yield for
other tasks to progress. Read the included dependency notices when distributing
compiled programs.
