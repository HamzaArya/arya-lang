# Release readiness and evidence

## Current source candidate: 1.3.0-alpha.2

This candidate adds the [application-flow syntax](flow-syntax.md) and list helpers. Local macOS arm64 verification passed documentation checks, TypeScript, and **245 tests with four optional skips** (249 total). Coverage includes initializer environments/TDZ, rest/spread, evaluation order and receivers, explicit async stages, guards, indexed captures, cleanup, stable error codes, source maps, passive editor services, project exports, and collection behavior.

A fresh recorded working-tree snapshot passed installation, checks, compiler/creator/editor packaging, installed-package acceptance, and the read-only release audit with no local failures or pending checks. Installed-package acceptance passed again on the minimum Node 22.15.0; the snapshot suite used Node 24.16.0. Both the data-flow example and its real Python statistics pipeline ran through the installed package.

Separate Chrome starter, Chrome UI/motion preview, Electron, and real VS Code/AryaCode companion-host checks passed. Companion verification used the new default-parameter/concise-function/pipeline syntax and checked semantic roles, icons, and themes. AryaCode's separately pinned embedded compiler is not upgraded by the companion extension. Live MySQL was not rerun locally for this candidate; Linux/Windows results must come from the exact pushed revision's CI.

The verified snapshot and archive identities are recorded locally in `.build/evidence/clean-2026-11-10T11-34-41-491Z/` and `artifacts/QUALIFICATION.json`. Final documentation-only evidence/migration notes were refreshed after that snapshot. Earlier retained archive hashes were checked unchanged. Candidate archives remain unpublished; npm latest remains the published alpha.4 baseline.

## Previous Node.js-only candidate: 1.3.0-alpha.1

The earlier alpha.1 source focused on Node.js and retired native compilation. See [candidate notes](releases/1.3.0-alpha.1.md) and [migration](node-runtime.md). Candidate checks, packaging, and editor-host verification are recorded separately from the earlier npm transaction. No new publication is implied by the source change. A C compiler is no longer required for the current suite.

Local candidate verification on macOS arm64 passed TypeScript, documentation checking (63 Markdown files and 382 local links), and 230 enabled tests; four optional integrations were skipped in the default suite. A fresh recorded source snapshot passed compiler/creator/editor packaging, installed-package acceptance, and the read-only audit. Installed-package acceptance also passed on Node 22.15.0; snapshot tests used Node 24.16.0.

Separate Chrome UI/library and Electron tests passed. The first Chrome UI startup exceeded its 10-second launch budget; a focused retry passed. Real VS Code and AryaCode hosts passed with language version 1.3.0-alpha.1, including semantic roles, icons, themes, and the setup tour. Live MySQL was not rerun for this candidate. Published earlier archives were checked and remain unchanged.

The source snapshot check now excludes tracked deletions while retaining new working files; a real Git-inventory regression verifies that behavior without staging changes. Candidate archives and source/check evidence remain local preparation artifacts until a separate publication is performed.


## Latest published baseline

**Current release: 1.2.0-alpha.4, published 10 November 2026.** Both `arya-language` and `create-arya-language` are published on npm's `latest` tag. The [publication record](releases/1.2.0-alpha.4-publication.json) contains registry URLs, SHA-256/SHA-512 identities, verified tags, and public-install results. This is an experimental alpha, with the scope below.

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
| Current Linux/Windows and additional architectures | Run the compiler/package CI matrix for the exact source revision; retain job results. Prior-version success is historical evidence. |
| Other editor products/platforms | Adapters are supplied; each actual application/version remains its own qualification target. |
| Live services | Run disposable MySQL integration and application-specific deployment tests before claiming those environments. |
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

Use [the release process](releasing.md). Preserve the candidate version, exact commit or source-manifest hash, dependency lockfile hash, Node/Python/C-toolchain versions, OS/architecture, command outputs, optional skips, archive hashes, registry responses, and downloaded-byte verification. A source snapshot can verify uncommitted work honestly; it must not be labeled a clean Git release commit.

## Historical evidence

- [0.2.0-alpha.3 release](releases/0.2.0-alpha.3.md): source `5a962385e1bdf35c8476748b992dc7efb0a01e2f`, npm SHA-256 `3ab98fe2b8745051a9b451fd3c4311a7805238226dfa163df37997560b07744b`, verified [GitHub prerelease](https://github.com/HamzaArya/arya-lang/releases/tag/v0.2.0-alpha.3). [CI run 42566241620](https://github.com/HamzaArya/arya-lang/actions/runs/42566241620) passed six compiler/package jobs for that older source; desktop evidence was local macOS only.
- [1.1.0-alpha.1 native publication](native-release-verification.md): version-specific native binaries, bootstrap hashes, and platform results.
- [1.2.0-alpha.3 npm publication](releases/1.2.0-alpha.3-publication.json): compiler/creator hashes and the earlier `next` tag verification.

Historical artifacts and immutable tags remain unchanged. Their older test counts and registry pointers do not describe the current release.
