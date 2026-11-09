# Release readiness and evidence

**Post-publication update, 9 November 2026.** The owner-authorized Apache-2.0 `arya-language@0.2.0-alpha.3` is published on npm, and its GitHub prerelease is published. The verified release source is `5a962385e1bdf35c8476748b992dc7efb0a01e2f`. The evidence below records actual publication and current six-job CI results; external learner review, final 0.2/1.0 qualification, and untested desktop/platform/architecture combinations remain open.

This update is a later documentation record. The immutable release tag and packaged documents retain their reviewed pre-publication preparation state; they have not been rewritten or retagged. A public alpha is still an experimental alpha, not a stable release.

## Published alpha.3 evidence

- npm: [`arya-language@0.2.0-alpha.3`](https://www.npmjs.com/package/arya-language/v/0.2.0-alpha.3). CLI publication succeeded after owner 2FA; the anonymous [registry version record](https://registry.npmjs.org/arya-language/0.2.0-alpha.3) and its tarball returned HTTP 200. The `next` tag is set. The registry also exposes `latest` at this alpha; the authenticated removal request returned HTTP 400. The semantic version and GitHub release remain explicitly prerelease. A fresh credential-free `arya-language@next` install passed the installed CLI and multi-file Check/Run example.
- GitHub: [`v0.2.0-alpha.3` prerelease](https://github.com/HamzaArya/arya-lang/releases/tag/v0.2.0-alpha.3), targeting source `5a962385e1bdf35c8476748b992dc7efb0a01e2f`. All eight uploaded assets were downloaded and matched the reviewed bytes.
- Published npm tarball SHA-256: `3ab98fe2b8745051a9b451fd3c4311a7805238226dfa163df37997560b07744b`. The verified source manifest contains 122 files with SHA-256 `f2381b363458e04bc1cd0331a27f89fe396bb77fbd060ff430c20518c6fca101` and records a clean release source tree.
- [CI run 42566241620](https://github.com/HamzaArya/arya-lang/actions/runs/42566241620): all six configured Linux/Windows/macOS and Node 22.15/24 jobs passed compiler/conformance, CLI, npm packing, and installed-package acceptance. This is not a claim that the CI built every editor archive or ran desktop apps; editor artifact builds and the embedded/portable desktop suites were verified locally on macOS only.

## Local audit

Run from the repository root after building and packing the candidate:

```sh
node scripts/check-release.mjs
node scripts/check-release.mjs --json
```

The script only reads local files and an existing archive; it does not publish, install dependencies, mutate metadata, create a tag, or contact a service. It verifies version consistency, owner/public-prerelease metadata, Apache-2.0/NOTICE/third-party text, the private security contact, runtime requirements, package/editor contents, and available artifact checksums. Missing artifacts are reported as pending. Invalid metadata or an inconsistent existing artifact is a local failure.

Exit zero means no local mechanical failures. `localArtifactReady` additionally requires no pending local artifacts/checksums; `publicPrereleasePackageReady` requires those complete mechanical checks plus the adopted public `next`-channel prerelease metadata. Neither field authenticates an account, reruns tests, approves a source revision, or proves a live upload. The legacy `publicReleaseReady`, `publicationVerified`, and `stableReleaseReady` remain false because those facts are not certified by this read-only audit. Actual live publication is independently recorded above; the audit flags have not been reinterpreted as transaction evidence. Linux/Windows and learner gates are labeled separately rather than treated as blockers for an honestly scoped alpha. Archive presence does not prove an external learner session occurred.

Use the [release process](releasing.md) to build, clean-install, and qualify the artifact. Run the actual test suite and archive acceptance commands; this audit does not rerun them or infer their results from a file's existence. Record outputs with the exact candidate version, source revision, and archive hash.

## Gate ownership and evidence required

| Gate | Current state | Evidence needed to close it |
| --- | --- | --- |
| Language implementation/conformance | Alpha.3: latest full local run passes 87 language/artifact tests; runtime qualification is recorded separately | Passing compiler, execution, lexical, module, mapping, and interop suites for the exact candidate. |
| Compiler/extension/CLI version labels | Mechanically audited | Matching package, compiler, extension language metadata, lockfile, archive identity, and release notes. |
| Clean install | Local isolated-snapshot acceptance passes | Archive installed into a fresh temporary project without repository-relative dependencies; version/check/build/run, multi-file example, and mapped failure observed. |
| Clean release provenance | Published alpha source `5a962385e1bdf35c8476748b992dc7efb0a01e2f` verified from a clean retained snapshot | The source manifest, dependency lockfile, logs, and matching artifacts identify the exact release. Later working-tree changes are outside that published revision. |
| Public license/distribution terms | Apache-2.0 adopted by Hamza Arya | Retain the canonical LICENSE, owner NOTICE, and bundled third-party notices in source and every artifact; audit their actual bytes. |
| Publication destination and release authority | Hamza Arya published npm alpha.3 and the GitHub prerelease; links/hash recorded above | Preserve the exact release assets and tag. The registry rejected `latest` tag cleanup with HTTP 400; use the explicit preview version or `next` installation commands. |
| Security reporting path | hamzaarya123@gmail.com; best-effort active-preview policy adopted | [SECURITY.md](../SECURITY.md) names Hamza Arya and the private address without inventing an SLA. Stable support lines/periods remain undefined until a stable release is qualified. |
| Linux and Windows | Alpha.3 compiler/CLI/package jobs pass in CI run 42566241620, including the Windows Unicode-path regression | Keep claims limited to the tested jobs. Desktop/editor execution on other operating systems and additional architectures is not established by those jobs. |
| macOS/local runtime evidence | Alpha.3 local suites: 87 language/artifact, 62 IDE, both desktop suites pass | Preserve prior roadmap results; rerun and record the current candidate rather than treating previous-version results as automatic qualification. |
| External learning observations | No feedback supplied; stable-readiness gate remains open | Real sessions/findings remain M7/M8/M9 evidence; a public alpha can invite that future review without claiming it happened. See [community review](community-review.md). |
| Dari/Pashto material | No fluent review supplied | Fluent review for any translation before claiming reviewed translated learning material. No translation is required merely to finish untranslated engineering work. |
| Evidence-selected tooling | Three reproduced engineering mitigations recorded; learner-driven selection pending | Completed [tooling decisions](tooling-evidence.md) linked to actual findings or a reproducible release-critical engineering risk. |
| Stable 1.0 contract | Policy prepared; stable release not declared | Qualified versioned 1.0 specification, compatibility/deprecation rules, owner decisions, distribution/platform evidence, and user-readiness gates. |

## Candidate evidence template

Store a completed record alongside the release revision or review, not as invented prefilled results:

```text
Candidate version:
Source revision / reviewed snapshot manifest:
Working tree status at packaging:
Dependency lockfile SHA-256:
Archive / VSIX / editor-kit filenames and SHA-256:
Build commands and environment:
Node / Python versions:
OS / architecture:
Compiler/conformance result and log:
Clean-install result and log:
Multi-file execution and mapped dependency failure:
LSP / portable / AryaCode result and log:
Platform job URLs or retained logs:
License and release-authority decision:
Publication destination and artifact approval:
Security contact and supported-release policy:
External learner session/finding references:
Tooling selection decisions:
Remaining limitations / failed gates:
```

## What may be completed now

Repository-local implementation, meaningful automated tests, examples, installation/migration instructions, compatibility policy, review protocol, evidence templates, checksums, and reproducible release commands can all be prepared without inventing the missing external facts. Those are concrete deliverables and should be tracked as complete when verified.

The alpha's license/destination/contact, exact release source/artifact review, and successful npm/GitHub publication are now recorded above. Broader M6 desktop/architecture qualification and M7's external observations stay open. M8 retains its evidence-selection gate, and M9 stays unqualified until the stable conditions hold. Owner authorization can select a license and destination; it cannot fabricate a platform run or a learner's observations.

The local `test:clean` run completed fresh dependency installation, checks, package/editor builds, installed lessons/examples, and audit in an isolated retained source snapshot. The exact source manifest, logs, runtime, and snapshot path are in `.build/clean-candidate-record.json`; built candidate artifacts and hashes are reviewable under `artifacts/`. A dirty parent checkout is still not a clean release commit, and these local results do not establish platform or participant outcomes.
