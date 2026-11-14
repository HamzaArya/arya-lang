# Arya 2.0.0 final delivery

Arya 2.0.0 was published as the stable GitHub release on **2026-11-14 at
03:36:12 UTC**. The [portfolio downloads page](https://hamzaarya.com/downloads/arya/)
and [GitHub release](https://github.com/HamzaArya/arya-lang/releases/tag/v2.0.0)
provide three platform SDKs, two VSIX packages, two native application collections,
source and checksums. All seventeen public files passed unauthenticated byte and
SHA-256 verification. No release payload was changed after those checks.

## Source and artifact identities

The immutable `v2.0.0` tag points to reviewed source-freeze commit
`d9669bff18e035b06c2d775be703e9a2d798bd1b`, tree
`b977290d155fe28ce56e5cd3e1408777f736c0f9`. Qualified native compiler, runtime and
library inputs originate at `ce80487668e082ffd263c5239d737de7074e4dc4`.
Original SDK build identities remain intact; separate assembly metadata records
the later documentation and installer assembly. This directory is an additive
delivery record after the release freeze. It does not change the tag or require
repacking the tested archives.

| Evidence | What it establishes |
| --- | --- |
| [Final inventory](final-delivery-inventory.json) | Exact final payload sizes/hashes, complete SDK and source archive inventories, and unchanged app/VSIX payloads |
| [Source archive binding](source-archive-binding.json) | Source archive SHA-256 `ae61e456c7e2c1ec9d396fec7bc3f1bf377cc71491190389f92eae1738fd50f2`, exact clean commit/tree before and after assembly, and all included source hashes |
| [Public downloads](public-release-verification.json) | Published non-draft/non-prerelease metadata and actual unauthenticated bytes/hashes for all seventeen assets |
| [Final Mac installation](final-mac-install-verification.json) | HOME unset; prefix with spaces and apostrophe; all 603 installed files; managed launcher; native output with no compiler/library override and runtime PATH unavailable |
| [Workspace promotion](workspace-sdk-promotion.json) | Complete paired qualified SDK installed locally, preceding 208-file SDK preserved, new 603-file SDK matched, and actual launcher check/build/run |
| [macOS assembly](assemblies/darwin-arm64.json), [Linux assembly](assemblies/linux-x64.json), [Windows assembly](assemblies/windows-cygwin-x64.json) | Original build identity and final metadata assembly separation |

The inventory's “publication not yet performed” status and the packaged
qualification's `published: false` describe the assembly instant. The later
public-download record establishes publication. Historical records are retained
as recorded instead of retroactively changing their outcomes.

The [assembly controller](finalize-generation-2.py) and
[public download verifier](verify-public-release.py) are retained for review.
The assembly controller intentionally refuses an existing destination or dirty
source snapshot. It is evidence of the completed run, not a command to rerun over
the finished release.

## Portfolio delivery and inspection

The existing Hostinger Git deployment serves portfolio commit
[`e56ffbf56f14c16604a694879b51851c7bdb1bf5`](https://github.com/HamzaArya/web-portfolio-hamza-upgrade/commit/e56ffbf56f14c16604a694879b51851c7bdb1bf5),
tree `bf8fa6258f54d05a9be56373bd29294d5a3f2e6f`. Updates used normal fast-forward
pushes from an isolated clean worktree. The user's original dirty portfolio
worktree was untouched; concurrent upstream Arya Code and privacy changes were
preserved.

- [Final deployment](portfolio-deployment-final.json) and
  [final live HTTPS verification](portfolio-live-final-verification.json) record
  six canonical routes, exact downloads HTML/manifest/CSS, all seventeen asset
  links and the corrected IDE-page release status.
- [Static verification](portfolio-final-static-verification.json) and
  [upstream integration](portfolio-rebase-a7.json) retain build and merge evidence.
  The production build, twenty focused tests and sixteen prerender tests passed.
- [Desktop browser inspection](manual-browser-verification.json) confirmed the
  live page's rendered header, stable version and platform cards, plus the
  accessible artifact links and requirements. Mobile visual validation and
  manually opening every download are not claimed by this spot check.

The IDE page initially retained an obsolete upstream qualification sentence.
Its final single-paragraph correction preserves the IDE's pinned development
SDK and links the separately released stable Arya SDK, with macOS 26 explicitly
attributed to the IDE. Five relevant tests passed. A production build initially
hit `ENOSPC`; space recovered without deleting files or stopping processes and
the complete retry passed. The [failed build](portfolio-ide-status-build-attempt1.log),
[successful build](portfolio-ide-status-build-retry.log) and
[test log](portfolio-ide-status-tests.log) are retained. The earlier deployment
and live-check JSON files remain unchanged as history.

## Scope and remaining limits

All required release qualification and delivery work is complete. See the
[release work report](../../../native-release-2.0.0.md) for each language and
application repair, earlier failures and their resolution. No application was
abandoned.

- SDKs: Apple Silicon macOS 15+, Linux x64 tested on Ubuntu 24.04, and Windows
  x64 with the matching Cygwin runtime/toolchain. MSVC/MinGW, cross-compilation,
  other architectures and older Linux distributions are not qualified.
- Direct GUI controls use AppKit, GTK 3 and Win32. The twelve supplied application
  bundles target Apple Silicon macOS 26+; they are not Windows/Linux app ports.
- macOS SDK/apps use verified ad-hoc signatures and have no Developer ID signing
  or Apple notarization. The compiler and core native programs need no Node or
  Python. Optional Python interoperability is unavailable on Windows/Cygwin.
- Windows sanitizer and file-size fault injection, and macOS leak detection,
  retain their documented coverage limits. Neither unavailable checks nor the
  later automatic main-branch CI run are substituted for the completed release
  qualification runs.

The source freeze was pushed to `main` and tagged before final assembly. This
subsequent evidence commit updates the current publication state while leaving
the frozen release contents intact.

The final broad Markdown check also found eight old relative links left behind
when Node-profile files moved under `compat/node`. Their targets were corrected
in three historical documents; historical statements and results were retained.
Both current-guide validation and the full Markdown link check then passed.
