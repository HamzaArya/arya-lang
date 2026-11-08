# Repository extraction and ownership

Source checkout: `/Users/hamza/Projects/github-repo/arya-ide`, revision `15a7955`.
New repository: `/Users/hamza/Projects/github-repo/arya-lang`.
Inventory date: 8 November 2026.

The IDE working tree initially contained only two untracked user documents: `docs/arya-language-logic-report.md` and `docs/arya-roadmap.md`. Both were copied byte-for-byte into this repository before any removals. Their old implementation links describe the pre-extraction snapshot; use this inventory for current paths. Existing Git history remains in AryaCode; this repository starts with an explicit extraction commit rather than rewriting either history.

| Original in AryaCode | Language repository destination | Ownership/action |
| --- | --- | --- |
| `packages/arya/src/{compiler,runtime,cli,language-service,lsp}.ts` | `src/` | Language-owned; CLI IDE helper dependency replaced with standalone file guards |
| `packages/arya/README.md` | root README, updated | Language setup/API/package documentation |
| `packages/arya/editors/` | `editors/` | Language editor configurations |
| `extensions/arya-language/` | `editors/vscode/` | Portable extension; copied shared UI adapter locally and removed its IDE source import |
| `extensions/arya-workbench/{syntaxes,snippets,language-configuration.json}` | `editors/vscode/` | Language-owned source assets; IDE copies these from the installed package at build time |
| `resources/arya-language/` | `brand/` | Language artwork and design notes |
| `fixtures/arya/` | `fixtures/arya/` | Examples and tutorial lessons; generated `.arya` and Python caches excluded |
| `docs/arya-{language,tutorial,editors}.md` | `docs/`, with IDE forwarding links | Language documentation; no separate specification existed at extraction time |
| `docs/arya-{roadmap,language-logic-report}.md` | `docs/`, original content preserved | Existing 0.2 plan and audit |
| `tests/arya.test.ts` | `tests/arya.test.ts` | Core execution/interop/parser tests extracted; workspace/trust/containment tests retained in IDE |
| `tests/arya-editor.test.ts` | `tests/arya-editor.test.ts` | Grammar and LSP tests extracted |
| `scripts/build-arya.mjs`, `scripts/package-arya.mjs` | `scripts/build.mjs`, `scripts/package-editors.mjs` | Standalone build/package pipeline; IDE uses installed package artifacts |

The following remain IDE-owned and were not moved:

- `packages/services/src/{language-runner,files,trust,environment,process-host}.ts`: workspace policy, containment, selected tools, process management, and project inspection.
- `extensions/arya-workbench/src/{arya-language,language-actions}.ts`: VS Code API integration and normal Build/Run/Stop commands. Language analysis imports the package API.
- `tests/arya.test.ts` workspace-specific tests, `tests/workbench/arya-host.ts`, `tests/workbench/arya-portable-host.ts`, and generic language-runner tests.
- Product configuration, IDE themes/icons, authentication, local servers, and upstream workbench infrastructure. An Arya filename does not imply language ownership.
- Shared `scripts/build.mjs`, `scripts/test.mjs`, `scripts/test-workbench.mjs`, `README.md`, and implementation status. Only their language-specific imports, asset paths, and commands change.

The standalone compiler does not depend on an IDE contract. The IDE installs a checked-in `vendor/arya-lang/arya-lang-<version>.tgz` with npm's integrity lock. A fresh `npm ci` needs neither a sibling checkout nor a GitHub remote. The IDE bundles the package API into its service/extension and copies CLI/editor assets from that exact installed package. Other tools install the identical archive.

Extraction checks: standalone typecheck/build/tests/package/clean installation; IDE typecheck/build/service tests; desktop Build/Run/diagnostics/arguments/Python selection; portable extension acceptance. Source maps are a later separate feature commit.
