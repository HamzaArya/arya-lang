# Compiler API

The package version and `ARYA_VERSION` identify the language/compiler release. Before 1.0, API changes require a documented minor or prerelease version; fixes preserve supported call forms.

```ts
import { compile, tokenize, AryaError, ARYA_VERSION } from 'arya-lang';
const result = compile(sourceText, {
  filename: '/absolute/project/main.arya',
  outputFilename: '/absolute/project/.arya/build/main.arya.mjs'
});
// result.code: JavaScript ES module
// result.map: serialized standard v3 source map
// result.mapFilename: output basename + ".map" (a sibling, never a path)
// result.symbols: top-level declarations with source tokens
// result.usesPython: whether the Python runtime is needed
```

Compilation and analysis are synchronous, side-effect free, and do not resolve or execute imported code. The caller controls filesystem reads/writes and execution. `AryaError.token` gives zero-based line and UTF-16 column plus source offsets. The CLI prints one-based positions.

`arya-lang/language-service` exports `analyze`, `completions`, and `hoverAt`. `arya-lang/cli` and `arya-lang/lsp` resolve to executable bundled entry points; npm also installs `arya` and `arya-lsp` commands. Both CommonJS and ES-module consumers can load the compiler.

Write `result.map` beside the generated module before writing `result.code`, then run Node with `--enable-source-maps` before the module path. Embedders validate both artifact paths under their own policy. The map contains relative URL-encoded source paths and `sourcesContent`; generated runtime code is unmapped. A map includes source text, so treat it as part of the program's source artifacts when distributing output.

The 0.1 `compile(sourceText, filename)` form remains supported. It assumes the generated filename is `<absolute source filename>.mjs`; use the options form when writing output elsewhere. Diagnostic/editor callers can use the legacy form without writing anything. API compatibility does not imply name/type checking: `check` remains a syntax and structural-context check in this prerelease.

The [normative specification](arya-specification.md#7-arya-built-ins-and-guaranteed-host-globals) defines the guaranteed bare host names for the Node execution profile. M3 will use that allowlist for lexical resolution; the specification does not enable lexical checks in the current preview. User declarations may shadow host names, subject to the documented generated-runtime limitations.
