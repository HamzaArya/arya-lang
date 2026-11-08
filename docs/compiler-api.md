# Compiler API

The package version and `ARYA_VERSION` identify the language/compiler release. Before 1.0, API changes require a documented minor or prerelease version; fixes preserve supported call forms.

```ts
import { compile, tokenize, AryaError, ARYA_VERSION } from 'arya-lang';
const result = compile(sourceText, '/absolute/project/main.arya');
// result.code: JavaScript ES module
// result.symbols: top-level declarations with source tokens
// result.usesPython: whether the Python runtime is needed
```

Compilation and analysis are synchronous, side-effect free, and do not resolve or execute imported code. The caller controls filesystem reads/writes and execution. `AryaError.token` gives zero-based line and UTF-16 column plus source offsets. The CLI prints one-based positions.

`arya-lang/language-service` exports `analyze`, `completions`, and `hoverAt`. `arya-lang/cli` and `arya-lang/lsp` resolve to executable bundled entry points; npm also installs `arya` and `arya-lsp` commands. Both CommonJS and ES-module consumers can load the compiler.
