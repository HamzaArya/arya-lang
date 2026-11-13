# Arya SDK and deployment guide

The native SDK contains Arya's compiler, checker, formatter, language server, project creator and test runner. The compiler is self-hosted Arya and emits C11 for the host C compiler. It builds ordinary native executables; Node and npm are not compiler or program requirements.

Use [Install Arya](installing.md) for platform status, source builds, transferring an SDK, PATH and upgrades. Use [Your first project](getting-started.md) for the create/check/test/build workflow. This guide describes what is installed and what an application needs at runtime.

## SDK layout and identity

| Path in an extracted SDK | Purpose |
| --- | --- |
| `arya` (`arya.exe` on Windows) | Native compiler and development tools |
| `install.sh` | Checksum-verified versioned macOS/Linux SDK installation |
| `lib/` | Native archives and headers used when building applications |
| `stdlib/` | Arya standard-library modules |
| `docs/` | Guides, API contracts and recorded evidence |
| `VERSION`, `manifest.json` | Version, profile, capabilities and platform limits |
| `BUILD-INFO.txt` | Assembly and compiler/generated-C identities |
| `SOURCE-SHA256SUMS` | Hashes of repository inputs; the source files themselves are not all bundled |
| `SHA256SUMS` | Hashes of the actual installed SDK files |
| `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES.txt` | Distribution and dependency notices |
| `qualification/` | Historical qualification records; consult their snapshot identities |
| `examples/` | Complete native example sources, including record composition, financial workers and streaming reports |
| `decimal.arya`, `calculation-worker.arya`, other root examples | Compatibility copies retained for earlier SDK commands |

Keep `lib/` and `stdlib/` beside the matching `arya` executable. A compiler symlink resolves resources through the executable's canonical location. `ARYA_NATIVE_LIBDIR` is an advanced library-directory override; avoid a stale override when switching SDKs. Choose another C compiler with `--cc`, `ARYA_CC` or `CC`. This selects a toolchain; it does not establish cross-compilation support.

Development snapshots may share a version string. Use compiler hashes, source identities and the corresponding verification record to distinguish them. An archive's checksum detects changes to that archive; it is not a substitute for obtaining the archive and expected digest from a trusted source. Source changes require rebuilding applications; switching PATH does not update previously compiled programs.

The SDK includes the current documentation index, guides, examples and selected measurement records. Links marked `source checkout` identify implementation or historical material that belongs to the complete source checkout rather than the installed SDK. In source, `native/DOCUMENTATION` is the shared inventory used for SDK assembly and the fresh-source verification gate.

## Build output and runtime requirements

A normal build produces the executable, generated `.c` source and a `.NOTICE` file. The C file can assist inspection/debugging but is not a runtime input. Preserve the notices when distributing applications. `arya run` manages its own output cache; explicit build output paths require `--force` to replace existing files.

| Application feature | Additional deployment requirement |
| --- | --- |
| Core language and ordinary standard modules | Compatible OS/CPU and linked system C/runtime libraries |
| URL support | Compatible system C++ runtime in addition to the bundled native URL code |
| Web/UI | Application assets and a browser where appropriate; the native server is HTTP/1 without built-in TLS |
| Python bridge | Explicitly selected Python interpreter and required Python modules |
| MySQL | Separately supplied MySQL C client libraries and application connection configuration |
| Direct GUI (`gui`) | AppKit/Cocoa on macOS; GTK 3 on Linux; Win32 controls and Cygwin runtime on Windows |
| Webview desktop (`desktop`) | macOS AppKit/WebKit system frameworks |
| Authentication | Bundled OpenSSL; macOS local authentication additionally uses Foundation/LocalAuthentication/Security and the application's signing/Keychain configuration |

A release executable does not need the Arya compiler, SDK, Node or a C compiler just to run. It still needs its application files, working directory and selected external dependencies. The compiler embeds imported Arya module code into the program; arbitrary assets and foreign modules are separate deployment concerns. A binary for one OS/CPU is not a portable replacement for builds on other targets.

MySQL builds select the C client SDK with `ARYA_MYSQL_PREFIX`; its `include/mysql.h` and `lib/` layout must match the compiler's requirements. Explicit Python calls can select an interpreter through `ARYA_PYTHON` or the bridge options. Read each feature's contract in the [standard library](standard-library.md) and [native profile](native-profile.md).

The optional Python bridge is not qualified on Windows/Cygwin. Its subprocess
setup still uses `fork`, which cannot safely clone Arya's asynchronous task
stack on that platform. Native compiler, CLI and GUI programs do not use this
bridge; `process.run` uses Cygwin's direct process-spawn API. Windows release
gates record sanitizer availability separately, because the Cygwin GCC package
may not supply ASan/UBSan. In that case, its focused gates run release/debug
builds with GC stress and explicitly report the instrumentation limitation.

## Editors

Configure an LSP client to start:

```sh
arya lsp --stdio
```

The installed SDK supplies native analysis, formatting and diagnostics. Checking and editor analysis do not execute project imports.

For VS Code-compatible editors, the optional adapter is a separate package. Its build sources belong to the full repository checkout; they are not included in the portable native source archive or standalone SDK. From the full checkout:

```sh
make native-editor
./bin/arya editor status --json
./bin/arya editor install --editor code
```

The editor selector also accepts `aryacode`, `cursor`, `codium` and `windsurf`; see [CLI options](cli.md). The bundled adapter includes a platform-matching native SDK; the portable adapter resolves an installed compiler. Both call `arya lsp --stdio`. Set the editor's `arya.compilerPath` to use another native compiler. Its transport runs in the editor's JavaScript host and is excluded from the standalone SDK. An SDK without that separate adapter can still serve any compatible LSP client.

## Exact data and boundaries

Ordinary `number` is IEEE 754 binary64. Use `std "decimal"`, `std "money"` or `std "accounting"` when exact monetary data is required. Parsed decimal values avoid repeated parsing in intensive native calculations; text formatting is an explicit boundary. Preserve exact values as strings across JSON and database boundaries, and validate external data with `std "validate"` before assigning concrete types.

The [accounting API](accounting-engine.md) covers exact invoice/ledger batches, balanced journals, trial balances and classified financial statements. Prepared calculations preserve their documented snapshot, rounding and cancellation contracts. The [finance/data contracts](native-finance-data.md) cover opt-in financial policies, CSV, bounded input and collection APIs. Keep the intended aggregate/settlement rounding boundary when chunking; independently rounded partial reports are not automatically equivalent to one complete calculation.

`calculation-worker.arya` is a standalone JSON-lines example accepting `invoiceTotals`, `invoiceBatch` and `ledgerBatch`. It is distinct from a particular Ledger application's worker and manifest. Building this repository does not select a new worker for an existing application or migrate its database. Input frames are bounded to 1 MiB; use multiple bounded requests or call the native library directly when appropriate, preserving the operation's accounting boundaries.

## Support and verification

The [native profile](native-profile.md) defines supported syntax, compatibility subsets, scheduler behavior and resource limits. The [standard-library reference](standard-library.md) is the API catalog. A historical benchmark or qualification file applies to its recorded snapshot, even when its version string matches this SDK. Use the corresponding build/delivery record for new artifacts; platform qualification does not imply production qualification for every application.

To inspect a locally installed package, run `arya --version` and verify `SHA256SUMS` from the SDK directory. To validate a source build, use the installation guide's `make check` and fresh `make native-clean-test` workflow. Optional live Python/MySQL, desktop-renderer and editor-host integrations have separate requirements and verification gates.
