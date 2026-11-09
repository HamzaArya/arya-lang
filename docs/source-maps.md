# Source-map design and acceptance

Implemented in Arya `0.2.0-alpha.1`. That first 0.2 preview retained the extracted 0.1 semantics. The later [alpha.2 preview](releases/0.2.0-alpha.2.md) adds lexical checks before emission; mapped runtime behavior remains unchanged for valid programs.

The parser already owns zero-based line and UTF-16 column positions. It annotates emitted fragments with explicit token origins, which survive nested string composition. A final pass consumes those annotations and records final generated positions after the runtime and optional Python bridge prefixes. The annotations are internal raw-NUL-delimited numeric markers; user strings and filenames are JSON-escaped before emission and cannot inject them. No annotations remain in generated code. Tests cover repeated names, same-line failures, Unicode, and literal marker-like data.

This deliberately retains the small parser while avoiding a search for identifiers in generated output or a guessed runtime line offset. A future AST can replace annotated strings without changing the package's map contract.

The encoder is pinned `@jridgewell/gen-mapping` 0.3.13, bundled into the compiler/CLI/LSP. Its dependency notices are included. See the [encoder's source documentation](https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping) and [Node's source-map flag](https://nodejs.org/api/cli.html#--enable-source-maps).

`compile(source, {filename, outputFilename})` returns JavaScript and a standard v3 map. The generated module has a relative, URL-encoded `sourceMappingURL`. `sources` is relative to the map (a file URL for cross-volume paths), and `sourcesContent` stores the exact source snapshot. Runtime prefixes have no user-source mappings; built-in/Python exceptions retain their generated implementation frames plus mapped Arya caller frames.

CLI and IDE validate module and map paths separately. Since alpha.3, they stage the complete module graph and its maps before replacing the owned output directory, with rollback if the swap fails. Run launches only after publication succeeds and never falls back to stale output. This does not promise a transaction across unrelated processes or hostile filesystem races. See the [project API](compiler-api.md).

Acceptance coverage:

- `fixtures/arya/runtime-error.arya` maps to `3:15`, caller `5:1`.
- Shared `fixtures/arya/errors/cases.json` drives CLI, standalone Node, and IDE integration tests for multiline, async, Python, built-ins, and Unicode.
- Standalone tests exercise paths containing spaces, Unicode, and `#`, relative map URLs, embedded source text, unmapped runtime prefixes, distinct same-line columns, and safe literal handling.
- CLI Build writes a complete code/map pair without executing the program; standalone Node then resolves its relative map URL, including encoded spaces, Unicode, and `#` in the output filename.
- Check remains passive and writes no artifacts. Syntax failures in Check, Build, and Run preserve the previous code/map pair and never launch stale output. Run preserves literal program arguments, including strings that are also Node flags.
- Clean-package acceptance installs the archive outside the checkout and verifies mapped CLI and standalone traces, with relative source paths and embedded source text.
- IDE tests retain trust, selected runtimes, arguments, symlink containment, and non-executing Build.
- Desktop tests observe real Build/Run tasks using an `uncaughtExceptionMonitor` that saves the thrown stack without handling it. A one-line instrumentation prefix preserves the first fixture's failure line and column.

Original M1 (alpha.1) qualification on macOS arm64 with Python 3.13.15 is retained below. Current alpha.3 results are recorded in the [release-readiness record](release-readiness.md).

| Runtime | Verified |
| --- | --- |
| Node 22.15.0 (minimum) | `npm run check`: 16 tests; clean-installed package; five AryaCode package/runner tests |
| Node 24.16.0 | `npm run check`: 16 tests |

The [qualification workflow](../.github/workflows/check.yml) runs `npm ci`, `npm run check`, archive packing, and `npm run test:package` on Linux, Windows, and macOS with Node 22.15.0 and 24 plus Python 3.13. Linux/Windows results are pending until that workflow runs. It covers this repository; AryaCode qualification runs separately in the IDE repository. A local Docker daemon was unavailable for Linux verification.

Source maps do not by themselves add stepping or breakpoints; an interactive debugger remains outside M1.
