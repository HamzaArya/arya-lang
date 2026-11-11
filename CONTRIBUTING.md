# Contributing to Arya

Arya is developed here. AryaCode is a separate editor product that consumes the compiler package. Start with the [documentation index](docs/README.md), [language contract](docs/arya-specification.md), and [compatibility policy](docs/compatibility-policy.md).

## Set up

Use Node.js 22.15 or newer and npm. The complete suite needs Python 3. Select Python with `ARYA_PYTHON` when the default is unsuitable. A C compiler is not required.

```sh
npm ci
npm run check
```

`check` validates documentation links, checks TypeScript, builds compiler/editor assets, and runs tests. Generated output belongs in the ignored `dist/`, `.build/`, `artifacts/`, or `.arya/` directories.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `src/compiler.ts`, `src/ast.ts`, `src/resolver.ts` | Grammar, analysis, lexical resolution, and JavaScript emission |
| `src/project.ts`, `src/cli.ts`, `src/project-creator.ts` | Module graphs, commands, and project creation |
| `src/standard.ts`, `src/std/`, `src/python-worker.ts` | Node standard libraries and Python execution |
| `src/ui-*.ts` | UI components, client behavior, styles, and motion |
| `src/language-service.ts`, `src/lsp.ts`, `src/semantic-tokens.ts` | Passive editor analysis and LSP |
| `src/editor.ts`, `editors/`, `brand/` | Extension installation, adapters, themes, and icons |
| `packages/create-arya-language/` | npm initializer; generated from the shared creator |
| `fixtures/`, `tests/` | Examples, conformance fixtures, and regression tests |
| `docs/`, `scripts/`, `.github/workflows/` | Guides/contracts, build tools, and CI |

## Commands

| Command | Purpose |
| --- | --- |
| `npm run docs:check` | Check local documentation links and fragments |
| `npm run build` | Build compiler, CLI, LSP, types, offline VSIX, and adapters |
| `npm run typecheck` | Check TypeScript without emitting |
| `npm test` | Build and run automated tests |
| `npm run arya -- check path/to/main.arya` | Check a project without executing it |
| `npm run ui:preview` | Serve the UI gallery at http://127.0.0.1:3040 |
| `npm run test:editors` | Run VS Code/AryaCode hosts in temporary profiles |
| `npm run test:clean` | Verify a fresh source snapshot and retain packaging evidence |

`test:clean` packs into its temporary snapshot. `package:editors` packs into the current checkout's `artifacts/` and refuses existing versioned archives; use a new candidate version or a fresh disposable checkout. Never replace a published version's retained archives.

Optional checks need explicit dependencies:

- MySQL: follow [database test setup](docs/mysql.md), then run `npm run test:mysql` against a disposable database.
- Chrome: set `ARYA_TEST_BROWSER` to its executable. After `npm test`, run `node --test --test-concurrency=1 .build/tests/ui-browser.test.cjs .build/tests/ui-library-browser.test.cjs`.
- Electron: set `ARYA_TEST_ELECTRON` to its executable for `node --test .build/tests/ui-desktop.test.cjs`. It needs a platform binary and desktop session.
- Editor hosts: install the actual editor apps before `npm run test:editors`.

Report skipped optional tests explicitly.

## Documentation changes

Use [docs/README.md](docs/README.md) as the current guide index and [docs/releases/README.md](docs/releases/README.md) for versioned changes. State when a feature needs a source candidate rather than the published baseline; use exact package versions in reproducible examples. Check command/option names against `src/cli.ts` and `src/project-creator.ts`, and library signatures against `src/standard.ts` and `src/std/`.

Keep old plans, audits, and retired instructions in [docs/history/](docs/history/README.md), with their original version/evidence scope. Preserve published hashes and publication records. Update inbound links when moving a document. Run `npm run docs:check` after edits and check/run affected examples; link checking does not execute code samples or verify external URLs.

## Make a change

Document public behavior where users look for it. Grammar changes must agree across the compiler, language service, and editor integrations. Keep Check/editor analysis free of dependency execution, database connections, and user-code evaluation.

Add meaningful regression or conformance tests for changed language/runtime behavior. Update examples and migration notes when syntax, reserved words, errors, or APIs change. Run relevant checks and describe results and skipped integrations in the pull request.

Open issues and pull requests in [HamzaArya/arya-lang](https://github.com/HamzaArya/arya-lang). Include a small reproducer, expected/actual behavior, exact compiler version, runtimes, and OS/architecture. Send security issues through [SECURITY.md](SECURITY.md).

## Distribution

Licensed under [Apache-2.0](LICENSE). Preserve [NOTICE](NOTICE) and [third-party notices](THIRD-PARTY-NOTICES.txt). No separate contributor license agreement is currently required.

Publication is a separate maintainer action. Follow the [release process](docs/releasing.md), use a new version for new package bytes, and preserve source manifests and checksums. Documentation commits after publication do not modify the published package.

The source test runner bounds concurrent test files to two to avoid competing Python startup deadlines and process pressure. Set `ARYA_TEST_CONCURRENCY=1` for a heavily loaded host (range 1–64); assertions and deadlines are unchanged.
