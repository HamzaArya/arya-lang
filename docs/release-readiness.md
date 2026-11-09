# Release readiness and evidence

**Recorded 9 November 2026.** Hamza Arya selected Apache-2.0, copyright 2026 Hamza Arya, homepage https://hamzaarya.com, private security contact hamzaarya123@gmail.com, npm package `arya-language` on the `next` tag, and a GitHub prerelease in `HamzaArya/arya-lang`. Authentication and successful live publication are not established by this record. No current alpha.3 Linux/Windows qualification or external learner feedback is available; retain those honest limits. Earlier revision `6312372` passed Linux/macOS Node 22/24 jobs with 30 tests and failed Windows on a Unicode Python path. Current UTF-8 fixes/local regressions do not substitute for fresh candidate platform jobs.

This is a prerelease/readiness record, not proof of publication. The owner has adopted Apache-2.0 and public npm prerelease metadata for `0.2.0-alpha.3`; the language and CLI names remain Arya/`arya`. An explicitly experimental, macOS-qualified alpha may be published without inventing Linux/Windows or learner results. That publication does not qualify final 0.2 or 1.0, and must not promote the alpha to `latest`.

## Local audit

Run from the repository root after building and packing the candidate:

```sh
node scripts/check-release.mjs
node scripts/check-release.mjs --json
```

The script only reads local files and an existing archive; it does not publish, install dependencies, mutate metadata, create a tag, or contact a service. It verifies version consistency, owner/public-prerelease metadata, Apache-2.0/NOTICE/third-party text, the private security contact, runtime requirements, package/editor contents, and available artifact checksums. Missing artifacts are reported as pending. Invalid metadata or an inconsistent existing artifact is a local failure.

Exit zero means no local mechanical failures. `localArtifactReady` additionally requires no pending local artifacts/checksums; `publicPrereleasePackageReady` requires those complete mechanical checks plus the adopted public `next`-channel prerelease metadata. Neither field authenticates an account, reruns tests, approves a source revision, or proves a live upload. The legacy `publicReleaseReady`, `publicationVerified`, and `stableReleaseReady` remain false because those facts are not certified by this read-only audit. Linux/Windows and learner gates are labeled separately rather than treated as blockers for an honestly scoped alpha. Archive presence does not prove an external learner session occurred.

Use the [release process](releasing.md) to build, clean-install, and qualify the artifact. Run the actual test suite and archive acceptance commands; this audit does not rerun them or infer their results from a file's existence. Record outputs with the exact candidate version, source revision, and archive hash.

## Gate ownership and evidence required

| Gate | Current state | Evidence needed to close it |
| --- | --- | --- |
| Language implementation/conformance | Alpha.3: latest full local run passes 87 language/artifact tests; runtime qualification is recorded separately | Passing compiler, execution, lexical, module, mapping, and interop suites for the exact candidate. |
| Compiler/extension/CLI version labels | Mechanically audited | Matching package, compiler, extension language metadata, lockfile, archive identity, and release notes. |
| Clean install | Local isolated-snapshot acceptance passes | Archive installed into a fresh temporary project without repository-relative dependencies; version/check/build/run, multi-file example, and mapped failure observed. |
| Clean release provenance | Pending a reproducible release revision | Clean revision or reviewed source snapshot, dependency lockfile, build commands, hashes, and matching artifacts. A dirty working tree is not a clean release revision. |
| Public license/distribution terms | Apache-2.0 adopted by Hamza Arya | Retain the canonical LICENSE, owner NOTICE, and bundled third-party notices in source and every artifact; audit their actual bytes. |
| Publication destination and release authority | Hamza Arya; npm `arya-language`/`next`; GitHub `HamzaArya/arya-lang` prerelease selected | Authenticate accounts, confirm publishing permissions, review the exact release revision/artifacts, then record successful transaction URLs and hashes. Until then live publication is pending. |
| Security reporting path | hamzaarya123@gmail.com; best-effort active-preview policy adopted | [SECURITY.md](../SECURITY.md) names Hamza Arya and the private address without inventing an SLA. Stable support lines/periods remain undefined until a stable release is qualified. |
| Linux and Windows | Alpha.3 results pending; prior `6312372` Linux/macOS jobs passed and Windows failed a Unicode Python path | Run fresh candidate jobs after the UTF-8 fix before adding platform claims. Historical results do not qualify alpha.3; missing current results do not block its explicitly macOS-qualified experimental publication. |
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

The alpha's license/destination/contact decisions are now recorded; its authentication, exact source/artifact review, and successful publication still need actual evidence. Broader M6 platform qualification and M7's external observations stay open. M8 retains its evidence-selection gate, and M9 stays unqualified until the stable conditions hold. Owner authorization can select a license and destination; it cannot fabricate a platform run or a learner's observations.

The local `test:clean` run completed fresh dependency installation, checks, package/editor builds, installed lessons/examples, and audit in an isolated retained source snapshot. The exact source manifest, logs, runtime, and snapshot path are in `.build/clean-candidate-record.json`; built candidate artifacts and hashes are reviewable under `artifacts/`. A dirty parent checkout is still not a clean release commit, and these local results do not establish platform or participant outcomes.
