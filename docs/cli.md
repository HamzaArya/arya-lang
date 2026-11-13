# Native CLI

`bin/arya` launches the native compiler in a source checkout; an installed SDK uses its `arya` executable directly.

| Command | Behavior |
| --- | --- |
| `arya --version` | Report the native compiler version |
| `arya create folder --template cli` | Create a new or empty project; templates: cli, native-gui, web, api, ui, desktop |
| `arya init [folder] --template web` | Initialize a new/empty project, defaulting to the current directory |
| `arya check file.arya [--json]` | Parse and analyze the project without executing imports |
| `arya build file.arya -o app --release` | Generate C11, compile and publish an executable |
| `arya run file.arya [-- arguments]` | Build/reuse a compiler-owned output, then execute it |
| `arya test file.test.arya` | Compile/run native tests using `std "testing"` |
| `arya fmt file.arya [--check]` | Format source, or check formatting |
| `arya lint file.arya` | Report native binding and control-flow diagnostics |
| `arya lsp --stdio` | Run the native language server |
| `arya editor status [--json]` | Inspect available editor launchers and SDK package |
| `arya editor path` | Print the packaged VSIX location |
| `arya editor install --editor code` | Install through a selected editor launcher |

## Build and analysis options

| Option | Meaning |
| --- | --- |
| `-o path`, `--output path` | Select the executable output |
| `--release` | Optimize generated C with `-O2`; this is the default mode |
| `--debug` | Build with the debug configuration and `-O0` |
| `--sanitize` | Enable AddressSanitizer/UndefinedBehaviorSanitizer; use with `--debug` for investigations |
| `--cc executable` | Select the C compiler; otherwise use `ARYA_CC`, then `CC`, then `cc` |
| `--force` | Permit replacement of an existing regular output; also bypass an automatic run cache hit |
| `--runtime-counters` | Emit runtime diagnostic counters; instrumented results are not release benchmarks |
| `--no-call-opt` | Disable call specialization, including advanced call optimization |
| `--no-advanced-call-opt` | Disable only the advanced call path for comparison |
| `--no-data-opt` | Disable compiler data optimizations, including eligible fixed-format conversion fusion |
| `--target native` | Explicitly select the only supported execution target |
| `--json` with `check` | Return structured analysis diagnostics |
| `--` with `run` | Forward remaining arguments to the program |

`native` remains an alias for `build`; `test` uses the native run path. Explicit existing output files need `--force`; source-file, directory and symlink protections still apply. Generated `.c` and `.NOTICE` files accompany a successful build. `run` caches compiler-owned outputs using source/dependency contents, toolchain/SDK metadata and executable identity. Changing build flags or the compiler invalidates that cache.

Keep `lib/` and `stdlib/` beside the installed compiler. `ARYA_NATIVE_LIBDIR` is an explicit library-directory override for toolchain work; normal installations should use the intact SDK. Building for another CPU/OS requires a compatible toolchain and separate target verification; `--target native` is not universal cross-compilation.

The editor selector accepts `all`, `code`, `aryacode`, `cursor`, `codium` and `windsurf`. It only invokes detected launchers; `status` does not install anything. Use an installed SDK's absolute executable path where `arya` is absent from PATH.

Standalone SDKs do not contain the optional VSIX. Build that adapter separately in the source checkout before using its install command, or connect an LSP client directly to `arya lsp --stdio`. Editor-host versions and native language versions are separate identities.

Registry commands, universal cross-compilation, an interactive REPL and a native debug adapter are separate roadmap work. The retained 1.3 CLI and its Node commands are documented under `compat/node/docs`.
