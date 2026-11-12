# Native CLI

`bin/arya` launches the native compiler in a source checkout; an installed SDK uses its `arya` executable directly.

| Command | Behavior |
| --- | --- |
| `arya --version` | Report the native compiler version |
| `arya create folder --template cli` | Create a new or empty project; templates: cli, web, api, ui, desktop |
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

Build options include `--debug`, `--release`, `--sanitize`, `--cc executable`, `--force`, `--runtime-counters` and optimizer comparison flags `--no-call-opt` / `--no-advanced-call-opt`. Native is the supported target. `native` remains an alias for `build`. Explicit existing output files need `--force`; directory/symlink publication protections and staging cleanup apply. `run` caches generated C, toolchain/SDK metadata and executable identity. Pass application arguments after `--`.

The editor selector accepts `all`, `code`, `aryacode`, `cursor`, `codium` and `windsurf`. It only invokes detected launchers; `status` does not install anything. Use an installed SDK's absolute executable path where `arya` is absent from PATH.

Registry commands, universal cross-compilation, an interactive REPL and a native debug adapter are separate roadmap work. The retained 1.3 CLI and its Node commands are documented under `compat/node/docs`.
