# Arya stable release plan

Status: stabilization work, 11 November 2026. The published experimental preview
is [1.3.0-alpha.9](releases/1.3.0-alpha.9.md) on `next`, with extension 1.3.4.
Its [publication record](releases/1.3.0-alpha.9-publication.json) includes the clean
source, all 12 passing platform jobs, package checks and public distribution evidence.
A possible first stable target is **1.3.0**, following a new release candidate and
qualification. This document does not declare a stable release. The work applies
to the Arya repository.


## Define the compatibility promise

Freeze the documented Node.js language grammar, module resolution, JavaScript/npm
interoperability, CLI/compiler API, source maps, and supported standard-library
contracts in a versioned specification. The [compatibility policy](compatibility-policy.md)
already describes major/minor/patch changes and deprecation windows; apply it to
every supported public surface from the first stable release onward.

Document optional types as their actual bounded implementation. Stable support
does not require full TypeScript feature parity. Specify which errors the checker
catches, where values remain dynamic, and where runtime validation is required.
Treat Python, MySQL, web UI, Electron and editor support as individually qualified
integrations with explicit version/platform matrices. A generated starter alone
does not qualify an installer or a deployed application.

## Prioritized improvements and acceptance criteria

| Priority | Improvement | Evidence required |
| --- | --- | --- |
| P0 | Freeze syntax, module and public API contracts | Versioned specification; runnable migration from alpha.7; conformance tests preserving documented behavior |
| P0 | Verify supported Node/OS combinations | Full compiler/type/test/package checks on Linux, Windows and macOS at Node 22.15.0, current 22, 24 and 26, tied to the new source revision |
| P0 | Exercise real consumer installations | Fresh-cache compiler and creator installs; ESM/CommonJS consumers; npm package imports; declarations, source maps, relocation and all supported starters |
| P0 | Make stable packaging executable | Both npm packages use matching stable versions and `latest`; editor metadata is stable; all four archives have verified identity, notices and checksums |
| P0 | Publish maintenance and security commitments | Maintainer-selected supported line, end-of-support policy and private reporting process; no response-time promise without a real commitment |
| P0 | Complete external user validation | Real clean-install/tutorial/module attempts, observed problems, fixes and retests recorded in [community review](community-review.md) |
| P1 | Strengthen type boundaries | Decimal/date API signatures now checked in annotated modules; add coverage for aliases, mutation/control flow and higher-order calls before promising stronger analysis |
| P1 | Improve npm/TypeScript interoperation | Evaluate consuming `.d.ts` files and type aliases against real packages; keep explicit trusted declarations until implemented and tested |
| P1 | Improve editor behavior | Closed-file workspace discovery, incomplete-source completion and rename safety; real editor-host navigation and debugging evidence |
| P1 | Test limits and failure behavior | Malformed-input/fuzz cases; cancellation/cleanup; large module graphs; parser/compiler memory and time measurements; documented resource limits |
| P1 | Qualify optional integrations | Actual Python interpreter matrix, live MySQL transactions, browser interactions and target Electron runtime checks for each advertised configuration |

The first stable release can support a deliberately documented subset while other
features retain explicit preview labels. Decide that scope before freezing the
release candidate. Feature count does not substitute for compatibility evidence.

## Work implemented in the current checkout

- Optional type checking knows the documented `decimal` and `datetime` signatures
  and propagates their return types into declarations. This catches incorrect
  numeric decimal arguments, missing rounding/zone arguments and misspelled fields.
- The package audit accepts stable candidate metadata as well as prereleases. It
  validates the creator archive in addition to compiler/VSIX/editor-kit artifacts.
- The CI matrix includes the Node 22 minimum plus current 22, 24 and 26 on each
  supported operating system. New jobs need to execute before they count as evidence.
- Source/fixture line endings are pinned in Git, and the test runner emits TAP
  failures immediately with bounded test/runner timeouts for diagnosis of leaks.
- Archive/editor tooling uses fflate 0.8.3 and VSCE 4.1.0. A VSCE-scoped override
  pins minimatch 11.0.7 because VSCE still requests the vulnerable 10.x line.
  Remove the override when VSCE's supported dependency includes the patched line.
  See the [fflate advisory](https://github.com/advisories/GHSA-px8p-9vwx-vf98),
  [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), and
  [additional minimatch fix](https://github.com/isaacs/minimatch/releases/tag/v11.0.7).
- Primary install examples point to the published alpha.7 package so current
  examples and the installed grammar agree.

These changes are unreleased. Preserve existing alpha.7 archives and publication
records. Choose a new candidate version before packaging this changed source.

## Current evidence and open failures

The local baseline passed 273 tests with four optional integrations skipped on
macOS arm64/Node 24.16.0. The final code/dependency snapshot passed 279 tests with
the same four optional integration skips, documentation checking and type checking.
`npm run test:clean` also passed a fresh-cache install, compiler/creator/editor
packaging, installed-package acceptance and the mechanical release audit. The local
record is `.build/clean-candidate-record.json`; its source inventory and logs identify
the exact tested snapshot. Packaging was isolated from retained published archives.

`npm audit --json` reported zero known vulnerabilities after the dependency updates
on 11 November 2026, down from four moderate findings. This is a dependency-advisory
check, not a full security assessment or evidence for untested platforms.

The alpha.7 [qualification workflow](https://github.com/HamzaArya/arya-lang/actions/runs/42988234569)
passed Linux/macOS Node 22.15/24 jobs. Its Windows jobs were cancelled after
reporting failures in inherited Python-pipe cancellation, the canonical multiline
fixture and web file/root handling. Those results do not qualify Windows. The
LF checkout policy addresses fixture-byte consistency; the Python and web
failures still require detailed Windows reproduction and successful reruns.
The separate [live MySQL workflow](https://github.com/HamzaArya/arya-lang/actions/runs/42988234561)
passed for alpha.7, which does not substitute for qualification of a new artifact.

A local attempt to obtain the official Node 26 archive timed out. Node 26 is
therefore configured in CI but not claimed as locally qualified by this work.

## Release sequence

1. Review the scope and compatibility contract. Choose a new candidate, for
   example `1.3.0-rc.1`, and synchronize compiler, creator and editor metadata.
2. Run `npm run check`, optional integration checks for claimed surfaces, and
   `npm run test:clean`. Retain source inventory, exact runtime identities and logs.
3. Run the CI matrix and consumer acceptance against that candidate. Fix failures
   and repeat the checks affected by each change. Record skips as open work.
4. Complete external-use observations and select the maintenance policy. Freeze
   the specification, migration guide, platform table and known limitations.
5. Prepare stable `1.3.0` in a fresh snapshot, run qualification against those exact
   bytes, then review the resulting archives and checksums for publication.
6. Publish compiler and creator to `latest`; verify public downloads and fresh
   installs. Create the matching GitHub release and retain provenance. Record the
   actual publication result only after those operations succeed.

`npm run release:check -- --json` is a read-only mechanical audit.
`publicStablePackageReady: true` means the local stable package set is consistent.
It does not certify the compatibility contract, security support, platform tests,
user observations or a successful publication; those remain separately reviewed
evidence. See the [release process](releasing.md).
