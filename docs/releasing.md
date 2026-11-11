# Build and publish an Arya prerelease

**Source candidate: 1.3.0-alpha.7. Published release: 1.2.0-alpha.4.** Both npm packages were verified on `latest` on 10 November 2026; their [verified transaction record](releases/1.2.0-alpha.4-publication.json) identifies the exact archives. Follow this process for a **new version**. Never rebuild over retained published archives or attempt to replace an existing npm version.

Hamza Arya is the release maintainer. The project uses Apache-2.0, npm packages `arya-language` and `create-arya-language`, and the existing [HamzaArya/arya-lang](https://github.com/HamzaArya/arya-lang) repository. Private security reporting is described in [SECURITY.md](../SECURITY.md).

## Prepare a new candidate

1. Review intended source changes and choose a new prerelease version. Update root package/lockfile, `src/compiler.ts`, and the creator package together. Build synchronizes the extension's numeric version, preview flag, and full `aryaLanguageVersion`.
2. Update current guides, migration notes, and `docs/releases/<version>.md`. Describe optional dependencies and the actual qualification scope. Keep historical release hashes and records intact.
3. Run `npm ci` and `npm run check`. Run appropriate optional database, browser, Electron, and editor-host checks; report skips and failures accurately.
4. Run `npm run test:clean` to verify and package a fresh source snapshot. This inventories tracked/unignored source without changing the Git index, records SHA-256 provenance, installs dependencies, checks docs/types/tests, builds all distributions, tests installed packages, and runs the read-only audit.
5. Review the retained snapshot path and logs in `.build/clean-candidate-record.json`. Preserve its `SOURCE-MANIFEST.json`, archive hashes, lockfile identity, and qualification results. Use the exact reviewed artifacts from that snapshot for publication.

With a warm cache, `npm run test:clean -- --offline-cache /absolute/path/to/npm-cache` copies the npm cache into isolated temporary storage. Without that option, dependencies require registry access. Once a release commit exists, prefer checking that exact clean revision. A recorded dirty-tree snapshot is reproducible evidence, not a clean release commit.

For a fresh disposable checkout of an unpublished candidate, the individual distribution commands are:

```sh
npm run check
npm run package:editors
npm run test:package
npm run release:check -- --json
```

`package:editors` writes compiler and creator tarballs, a VSIX, an editor-kit ZIP, and `SHA256SUMS` under that checkout's `artifacts/`. The build includes legal notices and offline editor assets. It refuses to replace any existing versioned archive; use the new candidate/snapshot workflow above.

## Publish the reviewed npm archives

Verify the account with `npm whoami --registry https://registry.npmjs.org/`. Complete npm's normal login and publishing 2FA flow. Never put passwords, tokens, or OTP values into documentation or repository files.

Select the intended registry tag explicitly. Package defaults use `next` for prerelease tooling. The owner selected `latest` for alpha.4 on 10 November 2026 to support `npm install arya-language@latest`; the alpha designation and qualification limits still apply. For a new authorized release, set its version in the example below and publish compiler first, then creator:

```sh
arya_release_version="<new-version>"
npm publish "./artifacts/arya-language-$arya_release_version.tgz" --ignore-scripts --registry https://registry.npmjs.org/ --access public --tag latest
npm publish "./artifacts/create-arya-language-$arya_release_version.tgz" --ignore-scripts --registry https://registry.npmjs.org/ --access public --tag latest
```

Use the reviewed archive paths if they remain in the temporary snapshot. Publish does not need a rebuild or lifecycle script. Ensure the selected tag is the intended maintainer decision before running the command; do not assume that a prerelease should automatically become `latest`.

npm scans uploads before making them installable. A successful publish command can precede registry availability; [npm documents the delay](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/). Wait and verify availability rather than submitting a second build of the same version.

## Verify the public result

For both package names, query the exact version and tags:

```sh
npm view "arya-language@$arya_release_version" version dist.integrity dist.tarball --json --prefer-online --registry https://registry.npmjs.org/
npm view arya-language dist-tags --json --prefer-online --registry https://registry.npmjs.org/
```

Repeat for `create-arya-language`. Download both public tarballs and compare SHA-256/SHA-512 with the reviewed files. Use a fresh npm cache and consumer folder to test `npm create arya-language@latest`, installation, compiler version, Check/Build, a running application, and bundled editor assets. Generated projects must pin the matching compiler version.

Only then write the versioned publication record with URLs, actual tags, hashes, source provenance, and public-install results. Preserve the reviewed archives. Documentation commits made afterward record outcomes; they do not alter the published bytes.

## Other distribution targets

Git commits/pushes, GitHub prereleases, editor marketplaces, and AryaCode's embedded compiler are distinct operations. Updating this repository or npm does not perform them automatically. For an authorized GitHub release, create its tag at the reviewed source, upload the exact frozen artifacts/legal/checksum/evidence set, and download them again to verify identity. Do not move old release tags.

Update AryaCode's compiler pin, archive integrity, lockfile, and integration metadata in its own repository when requested, then run its service and desktop acceptance checks.

## Deterministic editor archives

ZIP/VSIX packaging sorts entries and normalizes timestamps/modes while retaining executable scripts. `SOURCE_DATE_EPOCH` accepts a nonnegative safe integer; unset/empty defaults to 1980-01-01. ZIP dates are clamped to 1980–2099 and rounded down to two seconds in UTC. Source payload identity still matters: changing docs or metadata produces different archives and requires a new published version.

The read-only audit verifies mechanical prerequisites, not authentication, live publication, or stable support. See [release readiness](release-readiness.md), [compatibility](compatibility-policy.md), and [historical release notes](../CHANGELOG.md) for their separate evidence.

## Independent Marketplace metadata

When a frozen npm/offline VSIX must remain unchanged, prepare a separately versioned
Marketplace package from it:

```sh
node scripts/package-marketplace.mjs artifacts/arya-language-1.3.0-alpha.7.vsix 1.3.2 artifacts/arya-language-marketplace-1.3.2.vsix brand/arya-marketplace-icon.png
```

The script refuses archive replacement and checks that every runtime, grammar,
and legal payload remains unchanged. Only the numeric extension version,
VSIX manifest, README, and optional listing icon may change. The listing icon
was rasterized from the existing Arya SVG mark to meet Marketplace size limits. Upload this prerelease through the publisher
manager, verify the public version, and record its checksum separately.
