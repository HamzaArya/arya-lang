# Arya programming language

Arya 1.1 preview adds [native compilation and an Arya-written self-hosted compiler](docs/arya-native.md): `arya build main.arya --target native`. Native programs run without Node.js; the original JavaScript target remains available. See the [native profile contract](docs/arya-native-specification.md).

Arya compiles single-file and multi-file `.arya` programs to JavaScript ES modules, imports JavaScript/npm libraries, and calls Python functions through a JSON bridge. This repository owns the language independently of the AryaCode IDE.

Requires Node.js 22.15 or later. Python is optional unless a program uses `use python`. The full integration suite and clean-package tests require Python (`ARYA_PYTHON`, or `python3`/`python` on PATH).

```sh
npm ci
npm run check
npm run arya -- run fixtures/arya/hello.arya
npm run package
npm run test:package
```

The local archive appears in `artifacts/`. Install it into any project with `npm install /absolute/path/to/arya-language-<version>.tgz`, then use `npx --no-install arya run main.arya`, `arya check`, `arya build`, or `arya-lsp --stdio`. No registry publication is needed.

The compiler API is available as `import { compile, analyzeSource, AryaError, ARYA_VERSION } from 'arya-language'`; editor analysis is available from `arya-language/language-service`. Check rejects unknown lexical names and const writes without executing imports. The CLI, portable extension, LSP, and AryaCode share resolution and same-file lexical navigation data. See the [API contract](docs/compiler-api.md), [language reference](docs/arya-language.md), [tutorial](docs/arya-tutorial.md), [roadmap](docs/arya-roadmap.md), and [release process](docs/releasing.md).

AryaCode installs the same versioned npm archive as other consumers. Its workspace trust, selected tools, filesystem containment, process lifecycle, and integration tests stay in the IDE. See [extraction inventory](docs/repository-extraction.md).

Arya is licensed under [Apache-2.0](LICENSE), copyright 2026 Hamza Arya. Third-party licenses are retained in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt). The npm package is `arya-language`; the CLI commands remain `arya` and `arya-lsp`. The public preview uses npm's `next` tag and a [GitHub prerelease](https://github.com/HamzaArya/arya-lang/releases). It is not a stable 1.0 release. Local qualification covers macOS arm64; Linux/Windows and external learner review remain pending.

For the npm preview, use `npm install --save-exact arya-language@0.2.0-alpha.3`, then `npx --no-install arya --version`. See the [release-readiness record](docs/release-readiness.md), [installation guide](docs/installing.md), [multi-file learning path](docs/learning-path.md), and [community review protocol](docs/community-review.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).
