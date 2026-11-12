# Contributing to Arya

Arya is developed here. AryaCode is a separate editor product that consumes the compiler package. Start with the [documentation index](docs/README.md), [language contract](docs/arya-specification.md), and [compatibility policy](docs/compatibility-policy.md).

## Set up

Use Node.js 22.15 or newer and npm. The complete suite needs Python 3. Select Python with `ARYA_PYTHON` when the default is unsuitable. A C compiler is not required.

```sh
npm ci
npm run check
```

`check` validates generated documentation and links, checks core source formatting and TypeScript, builds compiler/editor assets, and runs tests. Generated output belongs in the ignored `dist/`, `.build/`, `artifacts/`, or `.arya/` directories.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `src/compiler.ts`, `src/ast.ts`, `src/resolver.ts`, `src/emitter.ts` | Grammar, analysis, lexical resolution, and JavaScript emission |
| `src/types.ts`, `src/type-model.ts`, `src/type-effects.ts`, `src/declarations.ts` | Flow checks, type compatibility, write effects and passive npm declarations |
| `src/project.ts`, `src/cli.ts`, `src/project-creator.ts` | Module graphs, commands, and project creation |
| `src/standard.ts`, `src/std/`, `src/python-worker.ts` | Node standard libraries and Python execution |
| `src/accounting*.ts`, `native/accounting/` | Independent exact batch runtime and optional native kernel |
| `src/ui-*.ts` | UI components, client behavior, styles, and motion |
| `src/language-service.ts`, `src/lsp.ts`, `src/semantic-tokens.ts` | Passive editor analysis and LSP |
| `src/editor.ts`, `editors/`, `brand/` | Extension installation, adapters, themes, and icons |
| `packages/create-arya-language/` | npm initializer; generated from the shared creator |
| `fixtures/`, `tests/` | Examples, conformance fixtures, and regression tests |
| `docs/`, `scripts/`, `.github/workflows/` | Guides/contracts, build tools, and CI |

## Commands

| Command | Purpose |
| --- | --- |
| `make native-call-test` | Native call/frame semantics, optimized/reference modes, GC stress, sanitizers and allocation bounds; requires a C11 toolchain |
| `node scripts/benchmark-native-calls.mjs` | Record native call timings, separate allocation counters and source identities after `make native` |
| `npm run docs:check` | Check generated release status, local links and fragments |
| `npm run docs:sync` | Refresh published status and feature availability from their shared records |
| `npm run format` / `npm run format:check` | Format/check the core modules listed in `scripts/format-core.mjs` |
| `npm run test:native-preview` | Require the host Clang toolchain and run native executable acceptance |
| `npm run benchmark:native-preview` | Compare equivalent JS/native process execution and record source/runtime identities |
| `npm run benchmark` | Measure compiler analysis/emission, workspace edits and generated size |
| `npm run build:accounting-native -- --sanitize` | Explicitly compile/check the optional C++ batch kernel; needs Node headers and a C++17 compiler |
| `npm run test:accounting` / `npm run benchmark:accounting` | Exact batch correctness and retained timing/size/RSS measurements |
| `npm run package:accounting` / `npm run package:accounting -- --native` | Retain standalone portable/platform archives; refuses existing files |
| `npm run test:accounting-package` | Verify both standalone archives through offline installs outside the checkout |
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
  Debugger qualification also needs a Node adapter (`ms-vscode.js-debug`). If
  AryaCode lacks one, set `ARYA_EDITOR_TEST_JS_DEBUG` to an installed adapter
  directory for a copy confined to the temporary test profile. Reports identify
  that dependency; the normal editor profile is untouched.

Report skipped optional tests explicitly.

For an alternating same-process accounting comparison, run
`node --expose-gc scripts/benchmarks/accounting-paired.mjs` after the native build.
Run benchmarks without competing checks, retain raw samples and record host load;
latency under a loaded development session is not a dedicated performance qualification.

## Documentation changes

Use [docs/README.md](docs/README.md) as the current guide index and [docs/releases/README.md](docs/releases/README.md) for versioned changes. State when a feature needs a source candidate rather than the published baseline; use exact package versions in reproducible examples. Check command/option names against `src/cli.ts` and `src/project-creator.ts`, and library signatures against `src/standard.ts` and `src/std/`.

Update `docs/feature-status.json` when availability changes and run `npm run docs:sync`.
The generated tables distinguish published behavior, unreleased source and planned
work. Changing a table alone does not qualify or publish a feature.

Keep old plans, audits, and retired instructions in [docs/history/](docs/history/README.md), with their original version/evidence scope. Preserve published hashes and publication records. Update inbound links when moving a document. Run `npm run docs:check` after edits and check/run affected examples; link checking does not execute code samples or verify external URLs.

## Make a change

Document public behavior where users look for it. Grammar changes must agree across the compiler, language service, and editor integrations. Keep Check/editor analysis free of dependency execution, database connections, and user-code evaluation.

Add meaningful regression or conformance tests for changed language/runtime behavior. Update examples and migration notes when syntax, reserved words, errors, or APIs change. Run relevant checks and describe results and skipped integrations in the pull request.

Open issues and pull requests in [HamzaArya/arya-lang](https://github.com/HamzaArya/arya-lang). Include a small reproducer, expected/actual behavior, exact compiler version, runtimes, and OS/architecture. Send security issues through [SECURITY.md](SECURITY.md).

## Distribution

Licensed under [Apache-2.0](LICENSE). Preserve [NOTICE](NOTICE) and [third-party notices](THIRD-PARTY-NOTICES.txt). No separate contributor license agreement is currently required.

Publication is a separate maintainer action. Follow the [release process](docs/releasing.md), use a new version for new package bytes, and preserve source manifests and checksums. Documentation commits after publication do not modify the published package.

The source test runner bounds concurrent test files to two to avoid competing Python startup deadlines and process pressure. Set `ARYA_TEST_CONCURRENCY=1` for a heavily loaded host (range 1–64); assertions and deadlines are unchanged.
