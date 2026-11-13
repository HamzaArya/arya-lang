# Arya 2.0.0 application qualification, generation two

All twelve applications were rebuilt and passed their complete engine suites
using the corrected, fully qualified macOS compiler. The exact downloaded
bundles also passed local native checks on macOS 26.5.2 ARM64. These are the
current release candidates; publication remains a separate step. The
[generation-one record](../application-release.md) and its archives remain
unchanged historical evidence.

| Collection | Archive in `.build/release-2.0.0/generation-2/final/` | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Six desktop applications | `arya-native-desktop-apps-2.0.0-darwin-arm64.zip` | 6,948,635 | `7f13352eff70ee63c29dec965db8ca5fbae3106fc793b6162bf97af43b7b5c8e` |
| Six calculators | `arya-native-calculators-2.0.0-darwin-arm64.zip` | 7,485,284 | `e6df8bee4a913d13aa4eef7452f7c5784ee7d1065d4d20060045fcf339685b4b` |

## Build and download identity

[Application run 43496335481](https://github.com/HamzaArya/arya-lang/actions/runs/43496335481),
job `132130301288`, passed from source
`ce80487668e082ffd263c5239d737de7074e4dc4`. Its explicit dispatch selected the
qualified macOS job `132128996700` from
[desktop run 43495958933](https://github.com/HamzaArya/arya-lang/actions/runs/43495958933).
The exact compiler SHA-256 is
`06d9dd9ce6d7447f3ce1ba15945538c9148ff896c7d09932f90fdad6b2c53c94`.
The controller verified all 582 SDK files, bootstrap C convergence and all 260
selected native build inputs before compiling the applications sequentially.

The compiler change corrected Cygwin crypto linkage. The application sources,
AppKit hosts and per-project resources were unchanged, but all twelve applications
were rebuilt so their evidence matches the new qualified compiler. No compiler
source check was relaxed. The original compiler provenance remains recorded in
[the SDK evidence](macos-sdk.json).

- [Application controller and SDK identity](applications/release-apps.json)
- [Desktop full engine/build report](applications/native-desktop-projects-build.json)
  and [bundle inventory](applications/native-desktop-projects-bundles.json)
- [Calculator full engine/build report](applications/native-calculators-build.json)
  and [bundle inventory](applications/native-calculators-bundles.json)
- [Exact GitHub artifact and archive identities](application-downloads.json)
- [Local exact-bundle verification](applications/local-verification.json)

Every application passed checking, release compilation, its full integration or
numerical/storage suite, ad-hoc signing and packaged native host/worker protocols.
The CI packagers extracted both ZIPs and verified file hashes and executable modes.
The downloaded artifact hashes matched GitHub's recorded values. All twelve
locally extracted bundles then matched their CI inventories and passed strict
signature verification, ARM64 executable checks, bundle version 2.0.0, macOS 26
minimum and actual `NativeHost --protocol-check`. Each protocol used a disposable
data store and `PATH=/nonexistent`; no user records were changed.

The exact new Pocket Calculator and Study Desk bundles were also opened through
native app control. Both main windows rendered native controls; their About
panels visibly showed `Version 2.0.0 (2.0.0)` and described the native AppKit
interface with compiled Arya logic. No calculation, edit, save or export was
performed. Both apps were quit, and the final app inventory confirmed neither
was running. This [manual evidence](applications/manual-ui.json) covers those two
launch/About spot checks, not visual interaction testing of every new bundle.

## Retained issue and compatibility boundaries

The first local verification controller expected only six applications at each
archive root and stopped before executing an application. Both ZIPs also contain
their intended `README.txt` and `verification.json`. The corrected controller
checks that exact eight-entry inventory, compares embedded verification metadata
to the qualified report, and verifies any already extracted bytes and modes before
continuing. The [failed attempt](applications/local-verification-attempt1-failure.json)
is retained. This was a verification-harness assumption; all application checks
subsequently passed. No application was abandoned.

These supplied applications require **macOS 26+ on Apple Silicon**, despite the
compiler SDK's macOS 15 minimum. Their native AppKit hosts and Arya engines have
no browser or Node/Python runtime dependency. They are ad-hoc signed, with no
Developer ID signature or Apple notarization. See the
[installation notes](../../../installing.md#downloaded-macos-applications).
Arya's direct GTK/Win32 widget support does not automatically port these existing
AppKit bundles. The documented numerical, persistence and resource limits remain.
