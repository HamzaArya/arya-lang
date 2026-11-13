# Arya 2.0.0 native application qualification

All twelve applications passed a fresh build and their complete engine suites
with the qualified final macOS compiler. The exact downloaded bundles also
passed local native host/worker checks on macOS 26.5.2 ARM64. These results
qualify the two application archives below; release publication is a separate
step and is not implied by this record.

| Collection | Archive in `.build/release-2.0.0/final/` | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Six desktop applications | `arya-native-desktop-apps-2.0.0-darwin-arm64.zip` | 6,948,635 | `71d74735771bac3c727736e2fb943a83446b0afc6cba0122ea4b1d80233ab6a7` |
| Six calculators | `arya-native-calculators-2.0.0-darwin-arm64.zip` | 7,485,285 | `e2851b0f0cd7b925b412dbac12189d533d2fa67fca3bcdd694f01bd1fc567f0b` |

## Exact build inputs and evidence

[Application workflow run 43475142800](https://github.com/HamzaArya/arya-lang/actions/runs/43475142800),
job `132056918377`, passed from application commit
`5d3286445587fec596b76f912f70cc1575679c75`. The ARM64 macOS 15 runner reused
the SDK from successful macOS qualification job `132039162194` in
[run 43470021848](https://github.com/HamzaArya/arya-lang/actions/runs/43470021848),
source `0dc38b789df2840aa2977769065479c578e70649`.

The exact compiler SHA-256 is
`fdd021f30cdbb09165898beb01ce189d76af4d4714ad119640748695ba2e07d1`.
The controller verified GitHub's artifact digest, the SDK archive, all 561 SDK
files, compiler bootstrap convergence and all 260 selected native build inputs.
Test/controller differences were recorded separately. This preserves the actual
compiler origin instead of attributing its binary to later documentation commits.

- [Controller result and SDK/source identities](applications/release-apps.json)
- [Desktop engine/build evidence](applications/native-desktop-projects-build.json)
  and [bundle/archive inventories](applications/native-desktop-projects-bundles.json)
- [Calculator engine/build evidence](applications/native-calculators-build.json)
  and [bundle/archive inventories](applications/native-calculators-bundles.json)
- [Local exact-bundle checks and final manual observations](applications/local-verification.json)

Each complete build ran Arya checking, release compilation, the application's
full integration or numerical/storage suite, strict ad-hoc signature checks and
every configured native host/worker view protocol. The packagers extracted the
ZIPs and matched all bundled files and executable permissions. Earlier output
folders, archives and reports were preserved. Desktop outer-app signing also
preserved its smoke-tested worker bytes; calculator reports record their final
signed worker identities and extracted-bundle protocol checks.

The downloaded GitHub bundles artifact `14063296926` matched 14,259,112 bytes
and SHA-256 `3283d1e580de55c73c86e44f7cbd4c2f7bbba277f653cd1f8cc4e8debb1bab9c`.
The evidence artifact `14063207159` matched 70,669 bytes and SHA-256
`eafac5b18266385af862182589f6931b57fd82f0cd7075481468e5ab1410d8f9`.
Those ZIPs remain under `.build/release-2.0.0/ci-apps-5d32864/` with complete
CI logs. Final archives were linked into `final/` without rewriting their bytes.

## Local native verification

On macOS 26.5.2 ARM64, all twelve downloaded bundles matched their CI file
inventories and passed `codesign --verify --deep --strict`, bundle version
2.0.0 and minimum macOS 26.0 checks. Every actual native host passed its
`--protocol-check` using a separate disposable store and `PATH=/nonexistent`.
No user store was used for these automated checks.

The final Pocket Calculator and Study Desk applications were then opened using
their exact extracted paths. Their native controls and empty initial stores
rendered correctly. Both About dialogs displayed `Version 2.0.0 (2.0.0)`, confirming
the fix that reads the bundle version instead of hardcoding 1.0. Both apps were
closed without saving records or calculations. This spot check does not claim to
repeat every earlier manual workflow for all twelve apps; those sessions remain
in the collection reports.

## Problems and completion boundary

Local disk pressure prevented another full local compiler bootstrap. The
qualified CI SDK and a sequential remote application build completed the work;
no application was abandoned. Python's local HTTPS client could not use the
machine's CA trust store while fetching artifacts; system `curl` succeeded with
normal certificate verification, and both artifact hashes matched. Native UI
tooling initially timed out selecting Pocket Calculator even though it launched.
Selecting the exact bundle path resolved duplicate identifiers from historical
copies. A subsequent app inventory confirmed both final test apps had exited.
These tool/environment issues did not require application source changes.

The applications require **macOS 26+ on Apple Silicon**, even though their
compiler SDK itself has a macOS 15 minimum. They use their existing Objective-C
AppKit hosts with compiled Arya engines; Arya's separate direct `std gui` API
does not automatically port these bundles to Windows or Linux. All bundles are
ad-hoc signed, with no Developer ID signature or Apple notarization. Signature
verification proves bundle consistency, not publisher identity or Gatekeeper
approval; see [installation notes](../../installing.md#downloaded-macos-applications).
The documented application resource, persistence and numerical limits remain.
