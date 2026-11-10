# Compiler API

The package version and `ARYA_VERSION` identify the language/compiler release. During the experimental alpha series, API changes require a documented minor or prerelease version; fixes preserve supported call forms.

```ts
import { compile, analyzeSource, tokenize, AryaError, ARYA_VERSION } from 'arya-language';
const result = compile(sourceText, {
  filename: '/absolute/project/main.arya',
  outputFilename: '/absolute/project/.arya/build/main.arya.mjs'
});
// result.code: JavaScript ES module
// result.map: serialized standard v3 source map
// result.mapFilename: output basename + ".map" (a sibling, never a path)
// result.symbols: top-level declarations with source tokens
// result.usesPython: whether the Python runtime is needed
// result.bindings / result.references: source-positioned lexical resolution
// result.diagnostics: [] after successful compilation
// result.imports / result.exports: source-positioned Arya module declarations
// result.moduleMembers: direct namespace member references for project validation
```

Compilation and analysis are synchronous, side-effect free, and do not resolve or execute imported code. The caller controls filesystem reads/writes and execution. `AryaError.token` gives zero-based line and UTF-16 column plus source offsets. The CLI prints one-based positions. `compile` rejects syntax and semantic errors; `AryaError.message`/`token` retain the first error for compatibility, and `AryaError.diagnostics` contains all independent semantic errors from a complete parse (one error for syntax failure).

`analyzeSource(sourceText, filename?)` returns `{symbols, bindings, references, diagnostics}` without producing maps. Syntax failure throws `AryaError`; a complete parse returns every semantic diagnostic. Bindings record their kind (`let`, `const`, `function`, `parameter`, `loop`, `catch`, `import`, `builtin`, or `host`) and scope ID. References record their source token, access (`read`, `write`, or `readwrite`), and resolved binding when known. User bindings have declaration tokens; host and builtin bindings do not. The graph is serializable and contains no scope-parent cycles. Scope IDs are local implementation identifiers, not persistent IDs.

Diagnostics have `{code, message, token, suggestion?, hint?}`. `hint` is optional actionable help; existing code/message/token fields retain their meanings. Source-analysis codes include `ARYA_SYNTAX`, `ARYA_UNKNOWN_NAME`, `ARYA_CONST_ASSIGNMENT`, and `ARYA_UNKNOWN_LIBRARY`. Unsupported legacy API target requests use `ARYA_UNSUPPORTED_TARGET`. Semantic diagnostics are ordered by source position. Suggestions are conservative and optional.

`arya-language/language-service` exports `analyze`, `completions`, `standardCompletions`, `hoverAt`, `definitionAt`, `diagnosticFixes`, `semanticTokens`, `encodeSemanticTokens`, `semanticTokenTypes`, and `semanticTokenModifiers`. The compiler entry also exports `diagnosticFixes(source, diagnostics, start?, end?)` and `formatDiagnostics(filename, sourceOrUndefined, diagnostics)`. Fixes contain `{title, code, start, end, replacement}` with UTF-16 offsets and require an exact current-source match. Formatting is side-effect free and produces source excerpts and help without reading files. See the [diagnostic contract](syntax-and-debugging.md). `standardCompletions(source, utf16Offset, target = "js")` returns documented standard-library and locally inferred immutable MySQL-handle methods for member access, including a trailing dot. It uses lexical bindings to avoid shadowed names, performs no filesystem reads or dependency loading, and returns no hints when the shape is unknown or an obsolete unsupported target was requested. These hints do not constitute static type checking. `analyze(source, uri)` returns the same resolution fields, catches syntax errors into diagnostics, and retains the legacy optional `error` alias for the first diagnostic. It keeps top-level symbols when semantic errors are present. `definitionAt(analysis, utf16Offset)` returns a same-file declaration token, or undefined for properties, unknown names, builtins, and host globals. The portable extension, AryaCode provider, and LSP consume these functions. `arya-language/cli` and `arya-language/lsp` resolve to bundled executable entry points. Both CommonJS and ES-module consumers can load the compiler.

Write `result.map` beside the generated module before writing `result.code`, then run Node with `--enable-source-maps` before the module path. Embedders validate both artifact paths under their own policy. The map contains relative URL-encoded source paths and `sourcesContent`; generated runtime code is unmapped. A map includes source text, so treat it as part of the program's source artifacts when distributing output.

The 0.1 `compile(sourceText, filename)` form remains supported. It assumes the generated filename is `<absolute source filename>.mjs`; use the options form when writing output elsewhere. Version `0.2.0-alpha.2` adds lexical checks to both call forms, so formerly accepted unknown names and const writes now fail compilation. This is name checking, not type checking. See the [migration notes](releases/0.2.0-alpha.2.md).

The [normative specification](arya-specification.md#7-arya-built-ins-and-guaranteed-host-globals) defines the guaranteed bare host names used for lexical resolution. User declarations may shadow them, subject to the documented generated-runtime limitations. Known-name TDZ timing, dependency availability, object properties, and runtime types remain runtime concerns.

## Project graph API

```ts
import { buildProject, checkProject, writeProject, ProjectError } from 'arya-language/project';
const checked = await checkProject('/absolute/project/main.arya'); // reads sources, writes/runs nothing
const project = await buildProject('/absolute/project/main.arya', {
  outputDirectory: '/absolute/project/.arya/build',
  // workspaceRoot: '/absolute/workspace', // additional embedder containment
  // projectRoot: '/absolute/project',    // explicit API override; CLI uses entry directory
  // signal: abortController.signal,
});
const entryOutput = await writeProject(project);
// launch: node --enable-source-maps <entryOutput> [...literal program arguments]
```

Both graph functions return `{entry, root, outputDirectory, entryOutput, modules}`. Canonical filenames identify modules; the modules array is deterministic and dependency-before-importer. Each module contains `{filename, outputFilename, compilation, dependencies}`; dependencies are canonical source filenames and compilation includes its adjacent source map. Each source compiles once per graph. Graph discovery may parse before final emission to resolve generated paths; no project code or library is executed.

`ProjectError` has `filename`, `diagnostics`, and `token` for its first diagnostic. It is a separate project API error class; consumers should catch it from `arya-language/project`. Codes include `ARYA_MODULE_NOT_FOUND`, `ARYA_MODULE_CYCLE`, `ARYA_MODULE_ESCAPE`, `ARYA_MODULE_EXPORT`, and `ARYA_PROJECT_LIMIT`, plus compiler diagnostics for a dependency's syntax/names. Project Check validates direct Arya namespace exports; it does not inspect JavaScript libraries or dynamic properties. Bare JS packages resolve from the generated tree, so place npm dependencies at the entry project's root/parent chain.

`writeProject` stages all code/maps and publishes the owned output directory with rollback. It returns the entry output filename. Cancellation before publication leaves the previous graph available but never authorizes launching it; callers must not launch when graph build/publication throws. A project carries its original optional AbortSignal; `writeProject(project, {signal})` can supply a publication signal. The output tree must remain contained, cannot contain source modules, and cannot contain unrelated or special files. Existing Arya generated modules/maps are accepted for migration. The default `.arya/build` and embedder-provided `.arya/run/<id>` directories are generated storage, not user-data folders. Staging is not a distributed transaction or cross-process lock.

Single-module `compile` remains synchronous and filesystem-free. It accepts `use arya` and records imports/exports, but cannot validate dependency existence/exports or canonical identity by itself. Its options may include `aryaImports`, a specifier-to-generated-relative-specifier record supplied by the graph builder; without it, deterministic `.arya.mjs` specifiers are emitted for manually arranged modules. Normal project consumers should use the graph API. Language-service single-document analysis also remains filesystem-free.

## Semantic highlighting

```ts
import {semanticTokens, encodeSemanticTokens,
  semanticTokenTypes, semanticTokenModifiers} from 'arya-language/language-service';

const tokens = semanticTokens('const greeting = "Hello"\nsay(greeting)', 'main.arya');
const lspData = encodeSemanticTokens(tokens);
```

Tokens expose UTF-16 `start`, `length`, `line`, and `character`, a semantic `type`, and modifier names. The exported legend arrays define LSP indexes; the encoder returns the standard delta-encoded integer array. Analysis uses lexical bindings to distinguish imports, functions, parameters, readonly variables, properties, methods, and constructor names. It does not inspect or execute libraries. The runtime is Node.js. The legacy explicit `js` target remains accepted; other API target values report `ARYA_UNSUPPORTED_TARGET`.

## Bundled editor assets and installation

```ts
import {editorAssets, discoverEditors} from 'arya-language/editor';

const assets = editorAssets(); // absolute VSIX, icon, grammar, adapters, and guide paths
const editors = await discoverEditors();
```

`editorAssets(packageRoot?)` reports the installed language version and extension ID `aryacode.arya-language`. `discoverEditors(options?)` checks supported launchers/app locations. `installEditorExtension(options?)` explicitly invokes the selected editor CLI and returns per-editor results; it can accept `editor`, `cli`, `force`, `extensionsDirectory`, and `userDataDirectory`. Discovery reads local installation metadata; installation writes to editor profiles and is separate from passive analysis. See [editor setup](editor-setup.md) for flags, compatibility-manager fallback, and qualification.
