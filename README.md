# Arya programming language

Arya compiles `.arya` programs to JavaScript ES modules, imports JavaScript/npm libraries, and calls Python functions through a JSON bridge. This repository owns the language independently of the AryaCode IDE.

Requires Node.js 22.15 or later. Python is optional unless a program uses `use python`. The full integration suite and clean-package tests require Python (`ARYA_PYTHON`, or `python3`/`python` on PATH).

```sh
npm ci
npm run check
npm run arya -- run fixtures/arya/hello.arya
npm run package
npm run test:package
```

The local archive appears in `artifacts/`. Install it into any project with `npm install /absolute/path/to/arya-lang-<version>.tgz`, then use `npx --no-install arya run main.arya`, `arya check`, `arya build`, or `arya-lsp --stdio`. No registry publication is needed.

The compiler API is available as `import { compile, AryaError, ARYA_VERSION } from 'arya-lang'`; editor analysis is available from `arya-lang/language-service`. See the [API contract](docs/compiler-api.md), [language reference](docs/arya-language.md), [tutorial](docs/arya-tutorial.md), [roadmap](docs/arya-roadmap.md), and [release process](docs/releasing.md).

AryaCode installs the same versioned npm archive as other consumers. Its workspace trust, selected tools, filesystem containment, process lifecycle, and integration tests stay in the IDE. See [extraction inventory](docs/repository-extraction.md).

The inherited `private: true` and `UNLICENSED` metadata remain unchanged pending the owner's license and publication decisions. No license has been selected and no remote is configured by this extraction.
