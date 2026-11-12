# Arya stable release plan

<!-- release-status:start -->
Published experimental preview: **1.3.0-alpha.9**, compiler and creator on npm’s `next` channel; editor extension **1.3.4**. The recorded release passed **12** Linux/Windows/macOS jobs on Node 22.15.0, 22, 24, 26. See the [publication record](releases/1.3.0-alpha.9-publication.json). This evidence describes the published artifacts; subsequent source changes require separate qualification.
<!-- release-status:end -->

A possible first stable target is **1.3.0**, following a release candidate, compatibility review and qualification. No stable release is declared.

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
| P1 | Strengthen type boundaries | Additional standard signatures and list element propagation are implemented; conservative mutation/control-flow checking is now implemented; qualify remaining host/alias boundaries before broader guarantees |
| P1 | Improve npm/TypeScript interoperation | A bounded `.d.ts` subset with default/CommonJS exports and non-generic overloads is implemented; evaluate broader real-package syntax and retain explicit trusted declarations for unsupported contracts |
| P1 | Improve editor behavior | Closed-file discovery and cached static navigation/rename are implemented; local editor hosts cover rename/buffers and Node debugging; qualify other platforms and large real workspaces |
| P1 | Test limits and failure behavior | Malformed-input/fuzz cases; cancellation/cleanup; large module graphs; parser/compiler memory and time measurements; documented resource limits |
| P1 | Qualify optional integrations | Actual Python interpreter matrix, live MySQL transactions, browser interactions and target Electron runtime checks for each advertised configuration |

The first stable release can support a deliberately documented subset while other
features retain explicit preview labels. Decide that scope before freezing the
release candidate. Feature count does not substitute for compatibility evidence.

## Published baseline and changed source

The publication record above is the source of truth for alpha.9 distribution and
platform evidence. Earlier alpha.7 Windows failures and local-only Node 26 attempts
are historical; they do not describe the published alpha.9 qualification.

The current checkout adds [editor/compiler improvements](editor-and-compiler-improvements.md):
closed-file discovery, incremental analysis, static namespace rename, additional
standard signatures, a conservative declaration reader, separate emission, seeded
stress tests, selected runtimes and repeatable performance measurements.
These changes are unreleased and need a new artifact version and fresh qualification.
Existing published archives and publication records remain unchanged. Learner sessions,
maintenance commitments and optional integration qualification remain release gates.

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
