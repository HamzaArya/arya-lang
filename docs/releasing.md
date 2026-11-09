# Build and publish an Arya prerelease

The owner selected **Apache-2.0**, copyright **2026 Hamza Arya**, homepage **https://hamzaarya.com**, private security contact **hamzaarya123@gmail.com**, npm package **`arya-language`**, and a GitHub prerelease in **[HamzaArya/arya-lang](https://github.com/HamzaArya/arya-lang)** on 9 November 2026. The CLI remains `arya`, the language remains Arya, and the source repository name remains `arya-lang`.

The selected first public candidate is **`0.2.0-alpha.3`**, published on npm's **`next`** tag and as a GitHub **prerelease**. It has local macOS arm64 qualification. Linux/Windows and external learner evidence remain open; this does not prevent an honestly scoped experimental alpha, and publication does not close stable 0.2/1.0 gates. This document records the intended procedure, not proof that a live publication succeeded.

## Prepare the exact artifact set

1. Update the package/compiler/extension language versions and migration notes together. Keep AryaCode's product version separate.
2. Retain the root `LICENSE`, owner `NOTICE`, and bundled `THIRD-PARTY-NOTICES.txt`; build must copy legal files into the portable extension and kit.
3. Run `npm ci`, `npm run check`, `npm run package:editors`, `npm run test:package`, and `npm run release:check -- --json` for the reviewed candidate. Archive names now start `arya-language-`, not the previous local-only package name.
4. Verify `LICENSE`/`NOTICE` bytes and metadata inside the tarball, VSIX, and editor kit; inspect `SHA256SUMS`, source manifest, and qualification evidence. Do not substitute a rebuilt archive after approving its checksum.
5. Review/commit the intended source files, leaving unrelated local work outside the release revision. Verify a detached clean worktree or the recorded source snapshot. A dirty parent checkout is not a clean release commit.
6. Update AryaCode's pinned archive, integrity, lockfile, and integration metadata together; run its check/build and embedded/standalone desktop acceptance.

Keep the candidate version, exact release commit/source-manifest hash, Node/Python/OS versions, test logs, and all artifact hashes in the review evidence. `release:check` is read-only: `publicPrereleasePackageReady` reports mechanical package prerequisites, not account authentication, a test run, or a successful publication. Its legacy `publicReleaseReady` remains false because that audit does not certify the full release process. Stable qualification is separate.

## Publish the owner-authorized alpha

The publishing account must first authenticate and have permission to publish `arya-language` and create releases in the selected GitHub repository. Check with `npm whoami --registry https://registry.npmjs.org/` and `gh auth status`. Complete the normal login/2FA flow when required; no account login or ownership is inferred from package metadata or a name-availability check.

For the reviewed alpha.3 tarball, the intended npm command is:

```sh
npm publish ./artifacts/arya-language-0.2.0-alpha.3.tgz --ignore-scripts --registry https://registry.npmjs.org/ --access public --tag next
```

Use the explicit `next` tag; do not promote this alpha to `latest` or call it stable. Verify the published version and distribution metadata rather than treating a dry run as publication:

```sh
npm view arya-language@0.2.0-alpha.3 version dist.integrity dist.tarball --json --registry https://registry.npmjs.org/
npm view arya-language dist-tags --json --registry https://registry.npmjs.org/
```

Record the actual npm response and tarball identity. If that exact version already exists, verify its identity before proceeding; a published npm version is not a mutable replacement slot.

Create and push `v0.2.0-alpha.3` at the reviewed release commit, then create the GitHub prerelease against that existing tag. The owner-authorized destination is the existing repository, not a newly invented remote. A concrete command after the tag exists is:

```sh
gh release create v0.2.0-alpha.3 artifacts/arya-language-0.2.0-alpha.3.tgz artifacts/arya-language-0.2.0-alpha.3.vsix artifacts/arya-editor-kit-0.2.0-alpha.3.zip artifacts/SHA256SUMS artifacts/SOURCE-MANIFEST.json artifacts/QUALIFICATION.json --repo HamzaArya/arya-lang --verify-tag --prerelease --title "Arya 0.2.0-alpha.3" --notes-file docs/releases/0.2.0-alpha.3.md
```

Record the resulting release URL/tag commit and verify the uploaded asset hashes. Update the publication record only from successful live operations; until then publication remains pending. Authentication, source review, tagging, and publication are explicit release operations and are not side effects of local packing or the audit.

## Reviewed-source clean verification

`npm run test:clean` inventories tracked and unignored project source into a fresh temporary source directory, records a SHA-256 manifest, installs dependencies there with `npm ci`, and runs checks, editor packaging, installed-package acceptance, and the local audit. It does not edit the Git index or disguise uncommitted work as a clean release revision. Evidence and the retained snapshot path are recorded in `.build/clean-candidate-record.json` and `.build/evidence/clean-*/`.

For offline verification with a warm cache, use `npm run test:clean -- --offline-cache /absolute/path/to/npm-cache`. The verifier copies the cache into temporary storage rather than mutating the original. Without that option, installation requires registry access. It never publishes or promotes artifacts automatically. After a release commit exists, prefer verifying that exact detached worktree and retain its actual revision in the evidence.

## Deterministic editor archives

Editor ZIP/VSIX packaging sorts entries, preserves payloads, and normalizes timestamps/Unix modes. Shebang scripts remain executable. `SOURCE_DATE_EPOCH` may be a nonnegative safe integer number of seconds; unset/empty defaults to 1980-01-01. ZIP dates are clamped to 1980–2099 and rounded down to two-second precision. The normalized epoch is supplied to VSCE; the final VSIX uses the same normalization as the kit. Encoding uses UTC and restores the caller's timezone. Focused tests and identical-source packaging comparisons cover these rules.

A published alpha remains an experimental alpha with the stated qualification scope. See the [readiness record](release-readiness.md), [security policy](../SECURITY.md), and [compatibility policy](compatibility-policy.md) for the stable/platform/community gates that publication does not satisfy.
