# Release readiness and evidence

## Published reliability preview: 1.3.0-alpha.9

Compiler/creator **1.3.0-alpha.9** are published on `next`; extension **1.3.4** is
published to Marketplace and included in the offline package. The
[publication record](releases/1.3.0-alpha.9-publication.json) identifies the clean
source commit, exact archives, public checks and distribution status.

The clean snapshot passed documentation, TypeScript and 296 tests with four optional
skips, distribution packaging, installed-package acceptance and the release audit.
All 12 Linux/macOS/Windows jobs passed on Node 22.15, 22, 24 and 26; live MySQL
integration passed. Real VS Code and AryaCode hosts passed. Public registry hashes
and a fresh public install were verified. `.gitattributes` and `.github` changes
are included in the tagged source. Docker, signed installers, browser/Electron
integration and external learner sessions remain separate qualification targets.
This remains an experimental prerelease.

## Retained local reliability candidate: 1.3.0-alpha.8

Compiler/creator 1.3.0-alpha.8 and extension 1.3.3 are local unpublished previews.
On macOS arm64 / Node 24.16.0, the complete `npm run check` passed documentation
links, TypeScript and 296 tests, with four optional integrations skipped (300 total).
The test coverage includes LSP protocol and mocked VS Code dependency lifecycle,
type/runtime/declaration agreement, native-path aliases and the mixed-JavaScript
quickstart. Real GUI editor-host, browser, Electron and live MySQL checks were not
rerun in this review. A fresh source snapshot passed dependency installation, the
complete check, compiler/creator/editor packaging, installed-package acceptance
and the read-only audit. The snapshot is a recorded dirty-tree inventory, not a
clean release commit. No package was published.

The first aggregate attempt timed out in a local-only npm fixture; the fixture now
uses `--offline`. A new onboarding test initially compared a symbolic temporary
path with its canonical path; its assertion now uses the canonical directory.
The complete suite passed after those corrections and the independent declaration
precedence fix. These are recorded failures and reruns, not silently discarded tests.

The prior [HEAD qualification](https://github.com/HamzaArya/arya-lang/actions/runs/42990804426)
passed Linux/macOS Node 22.15/24 but both Windows jobs were cancelled. Inspection
reproduced the Windows static-file alias mismatch locally and fixed test-child
cleanup order. Windows Node24's inherited-pipe Python cancellation test passed;
no speculative Python cancellation change was made. A real Windows rerun of this
new candidate remains required; the current source has not been pushed.

See [alpha.8 changes and migration](releases/1.3.0-alpha.8.md). Existing alpha.7
archives and publication records are retained unchanged.

## Previous published preview: 1.3.0-alpha.7

The business application preview is published to npm’s `next` channel. Both public
package downloads match the reviewed archives. A fresh public-registry install
passed compiler, decimal/date, host-binding isolation, declaration, type-error,
and project-creator checks. The `latest` tag remains on 1.2.0-alpha.4.

The [publication record](releases/1.3.0-alpha.7-publication.json) identifies source,
archive hashes, public verification and distribution status. The
[engineering report](business-applications-report.md) and
[implementation record](business-applications-plan.md) retain the prepublication
qualification evidence. Historical “unpublished” statements refer to that phase.

Local qualification passed 273 tests with four optional skips, Node 22 package
acceptance, browser checks, and actual VS Code/AryaCode extension hosts. GitHub
Linux/macOS checks passed on Node 22/24, and live MySQL integration passed.
Windows jobs were still running when publication evidence was recorded; consult
the linked workflow for current results. Marketplace extension 1.3.2 carries the
reviewed language 1.3.0-alpha.7 code. Its status is recorded separately.

Stable support, Docker, signed installers and application deployments remain
separate qualification targets. Earlier results below remain version-specific.

## Previous canonical-syntax candidate: 1.3.0-alpha.4

This candidate selects canonical syntax and removes the alternate parser spellings and implicit `say` builtin. See [release notes](releases/1.3.0-alpha.4.md) and [syntax migration](syntax-migration.md). The compiler, generated runtime, starter templates, fixtures, active documentation, snippets, grammars, completions, hover help, source highlighting, and editor tour use the chosen spellings.

The previous version's verification and archive hashes below remain specific to their original snapshots. Local macOS arm64 `npm run check` passed documentation links, TypeScript, and 252 tests with four optional skips (256 total) on Node 24.16.0. Fresh alpha.4 compiler/creator tarballs, VSIX, and editor-kit packaging passed. Installed-package acceptance outside the checkout passed, including removed-syntax rejection, reclaimed names, canonical conformance, npm creator/npx entry points, all five starters, portable project installation, source maps, and Python. The read-only audit reported zero local failures/pending checks; all 32 pre-existing retained archives were checked unchanged. Verification used this working checkout rather than a new clean-source snapshot. Documentation-only result notes were added afterward without replacing the reviewed archives. Real browser, Electron, editor-host, live MySQL, and Linux/Windows checks were not rerun for this syntax change. The npm baseline remains the recorded 1.2.0-alpha.4 publication.

## Previous UI candidate: 1.3.0-alpha.3

This candidate extends the [UI components, sections, and templates](ui-patterns.md). Local macOS arm64 verification passed TypeScript/documentation checks and **251 tests with four optional skips** (255 total). A fresh recorded working-tree snapshot passed installation, checks, compiler/creator/editor packaging, installed-package acceptance, and the local release audit with no failures/pending checks. Installed-package acceptance also passed on Node 22.15.0; the snapshot suite used Node 24.16.0.

Real Chrome checks passed for the controls, eight section demos, four full-page templates, preview submit actions, themes, existing forms/motion, source tabs, CSP, and 390px mobile layouts without page overflow. Desktop/mobile screenshots were inspected for spacing and readability. Live MySQL, Electron, and real editor hosts were not rerun locally for this UI candidate; previous results remain version-specific. GitHub platform results must be checked for the exact pushed revision.

The recorded snapshot is identified by source manifest `76c8729929fbdcb6159539b68df12c6259626eb91a4b3c612f57404afef79581`; local evidence lives in `.build/evidence/clean-2026-11-10T12-05-04-939Z/`. Documentation-only version/evidence notes were refreshed after that snapshot. Retained candidate archives and hashes are recorded in `artifacts/QUALIFICATION.json`; earlier archive hashes remain unchanged. This is an unpublished candidate. The latest verified npm publication remains alpha.4.

### Documentation review — 11 November 2026

Repository documentation was reorganized and checked against the current source. `npm run check` passed documentation links, TypeScript, and 251 tests, with four optional integrations skipped. The 74 non-error Arya guide snippets compiled (nine with their documented surrounding bindings/imports); the intentional const-write exercise was verified to fail. Temporary-project smoke checks covered CLI arguments/JSON reports, build/maps, standalone execution, file/JSON helpers, and all five creator templates.

This review did not rerun browser, Electron, editor-host, live MySQL, or cross-platform qualification. It did not rebuild retained release archives; their earlier source manifests and hashes remain specific to their recorded snapshots.

## Previous flow candidate: 1.3.0-alpha.2

This candidate adds the [application-flow syntax](flow-syntax.md) and list helpers. Local macOS arm64 verification passed documentation checks, TypeScript, and **245 tests with four optional skips** (249 total). Coverage includes initializer environments/TDZ, rest/spread, evaluation order and receivers, explicit async stages, guards, indexed captures, cleanup, stable error codes, source maps, passive editor services, project exports, and collection behavior.

A fresh recorded working-tree snapshot passed installation, checks, compiler/creator/editor packaging, installed-package acceptance, and the read-only release audit with no local failures or pending checks. Installed-package acceptance passed again on the minimum Node 22.15.0; the snapshot suite used Node 24.16.0. Both the data-flow example and its real Python statistics pipeline ran through the installed package.

Separate Chrome starter, Chrome UI/motion preview, Electron, and real VS Code/AryaCode companion-host checks passed. Companion verification used the new default-parameter/concise-function/pipeline syntax and checked semantic roles, icons, and themes. AryaCode's separately pinned embedded compiler is not upgraded by the companion extension. Live MySQL was not rerun locally for this candidate; Linux/Windows results must come from the exact pushed revision's CI.

The verified snapshot and archive identities are recorded locally in `.build/evidence/clean-2026-11-10T11-34-41-491Z/` and `artifacts/QUALIFICATION.json`. Final documentation-only evidence/migration notes were refreshed after that snapshot. Earlier retained archive hashes were checked unchanged. Candidate archives remain unpublished; npm latest remains the published alpha.4 baseline.

## Previous Node.js-only candidate: 1.3.0-alpha.1

The earlier alpha.1 source focused on Node.js and retired native compilation. See [candidate notes](releases/1.3.0-alpha.1.md) and [migration](node-runtime.md). Candidate checks, packaging, and editor-host verification are recorded separately from the earlier npm transaction. No new publication is implied by the source change. A C compiler is no longer required for the current suite.

Local candidate verification on macOS arm64 passed TypeScript, documentation checking (63 Markdown files and 382 local links), and 230 enabled tests; four optional integrations were skipped in the default suite. A fresh recorded source snapshot passed compiler/creator/editor packaging, installed-package acceptance, and the read-only audit. Installed-package acceptance also passed on Node 22.15.0; snapshot tests used Node 24.16.0.

Separate Chrome UI/library and Electron tests passed. The first Chrome UI startup exceeded its 10-second launch budget; a focused retry passed. Real VS Code and AryaCode hosts passed with language version 1.3.0-alpha.1, including semantic roles, icons, themes, and the setup tour. Live MySQL was not rerun for this candidate. Published earlier archives were checked and remain unchanged.

The source snapshot check now excludes tracked deletions while retaining new working files; a real Git-inventory regression verifies that behavior without staging changes. Candidate archives and source/check evidence remain local preparation artifacts until a separate publication is performed.


## Recorded published baseline

**Recorded publication: 1.2.0-alpha.4, published 10 November 2026.** Both `arya-language` and `create-arya-language` were verified on npm's `latest` tag at publication. The [publication record](releases/1.2.0-alpha.4-publication.json) contains registry URLs, SHA-256/SHA-512 identities, verified tags, and public-install results. This is an experimental alpha, with the scope below.

## Published alpha.4 baseline evidence

| Area | Recorded alpha.4 result |
| --- | --- |
| Source provenance | Recorded working-tree snapshot; manifest SHA-256 `96bd4f72cd0fbca7dd74ea95c0fa2091bb6bc58283a186096f802dd065530461`. No clean release commit was claimed for the npm artifact. Later repository commits do not change those published bytes. |
| Core checking | TypeScript and 243 enabled tests passed; four optional integrations were skipped in the default suite. |
| Clean package | Fresh snapshot dependency installation, compiler/creator/editor packaging, installed-package acceptance, and mechanical audit passed. |
| Minimum Node | Installed-package acceptance passed on Node 22.15.0; the source snapshot used Node 24.16.0. |
| Native bootstrap | Three generations converged to identical generated C; native conformance, branded syntax, safe access, and const-write rejection passed. |
| Browser/desktop | Separate Chrome UI/library and Electron checks passed. Initial simultaneous Chrome launches timed out at startup; the serial browser retry passed. |
| Editors | Real VS Code 1.143.1 and AryaCode 1.145.2 hosts passed semantic token, theme, file-icon, and setup-tour checks in temporary profiles. |
| Public install | Fresh-cache `npm create arya-language@latest`, npm install with lifecycle scripts disabled, check/build, live UI/API validation, bundled editor assets, and desktop project creation passed. |
| Archive identity | Both public registry downloads matched the reviewed SHA-256 and SHA-512 hashes. Published archives remain frozen. |
| Live MySQL | Not rerun for alpha.4; unit/driver-contract coverage is part of the default suite. Use the separate live-database workflow for current evidence. |
| Platforms | Local macOS arm64 evidence. Fresh Linux/Windows results were not part of this npm publication. |

Full local logs and artifact metadata were retained under `.build/evidence/clean-2026-11-10T09-24-23-144Z/` and `artifacts/QUALIFICATION.json` on the publishing machine. These ignored local directories are not portable public links; the versioned publication record and release notes carry the public summary.

See [alpha.4 release notes](releases/1.2.0-alpha.4.md) for feature and migration details. A GitHub release, editor-marketplace publication, and an updated AryaCode embedded compiler are separate distribution operations.

## Remaining qualification

| Gate | Current state / next evidence |
| --- | --- |
| Current platforms and additional architectures | Linux/macOS passed on Node 22/24 for reviewed source 8ea5f94. Windows remains pending in the linked matrix; additional architectures remain unqualified. |
| Other editor products/platforms | Adapters are supplied; each actual application/version remains its own qualification target. |
| Live services | The disposable MySQL integration workflow passed for reviewed source 8ea5f94. Application-specific deployments and authentication chains remain separate checks. |
| External learners | No real session results supplied. Follow [community review](community-review.md) and report observed failures and interventions. |
| Dari/Pashto material | No fluent translation review supplied. |
| Stable compatibility/support | No stable release, SLA, or maintained stable branch declared. Follow the [compatibility policy](compatibility-policy.md) and [security policy](../SECURITY.md). |

The repository workflows are executable qualification plans. A workflow file or newly pushed commit does not by itself establish a passing platform result.

## Read-only local audit

After packaging a new candidate in a disposable snapshot:

```sh
npm run release:check -- --json
```

The audit reads metadata, legal files, existing archives, and checksums. It does not build, execute program code, publish, or authenticate. Exit zero means no mechanical failures; missing artifacts can still be pending. `localArtifactReady` and `publicPrereleasePackageReady` additionally require complete local artifact checks. The latter expects the ordinary `next` prerelease package default; an explicit authorized publish flag selected `latest` for alpha.4.

The audit's `publicReleaseReady`, `publicationVerified`, and `stableReleaseReady` remain false because this tool does not verify those external facts. The independent publication record verifies the completed npm transaction. Do not interpret an audit flag as a failed live publication or turn archive presence into learner evidence.

## Record a new candidate

Use [the release process](releasing.md). Preserve the candidate version, exact commit or source-manifest hash, dependency lockfile hash, Node/Python versions, OS/architecture, command outputs, optional skips, archive hashes, registry responses, and downloaded-byte verification. A source snapshot can verify uncommitted work honestly; it must not be labeled a clean Git release commit.

## Historical evidence

- [0.2.0-alpha.3 release](releases/0.2.0-alpha.3.md): source `5a962385e1bdf35c8476748b992dc7efb0a01e2f`, npm SHA-256 `3ab98fe2b8745051a9b451fd3c4311a7805238226dfa163df37997560b07744b`, verified [GitHub prerelease](https://github.com/HamzaArya/arya-lang/releases/tag/v0.2.0-alpha.3). [CI run 42566241620](https://github.com/HamzaArya/arya-lang/actions/runs/42566241620) passed six compiler/package jobs for that older source; desktop evidence was local macOS only.
- [1.1.0-alpha.1 native publication](history/native-release-verification.md): version-specific native binaries, bootstrap hashes, and platform results.
- [1.2.0-alpha.3 npm publication](releases/1.2.0-alpha.3-publication.json): compiler/creator hashes and the earlier `next` tag verification.

Historical artifacts and immutable tags remain unchanged. Their older test counts and registry pointers do not describe the current release.
