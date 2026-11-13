# Calculator delivery report

## Current 2.0.0 application release — generation two

All six calculator engines were freshly checked, compiled and passed their complete suites in [run 43496335481](https://github.com/HamzaArya/arya-lang/actions/runs/43496335481), using source `ce80487668e082ffd263c5239d737de7074e4dc4` and qualified compiler `06d9dd9ce6d7447f3ce1ba15945538c9148ff896c7d09932f90fdad6b2c53c94`. The application sources and native hosts were unchanged. The compiler's Cygwin crypto-link repair required new compiler provenance, so every application was rebuilt without relaxing source checks.

- Current archive: `.build/release-2.0.0/generation-2/final/arya-native-calculators-2.0.0-darwin-arm64.zip` (7,485,284 bytes).
- SHA-256: `e6df8bee4a913d13aa4eef7452f7c5784ee7d1065d4d20060045fcf339685b4b`.
- [Complete build evidence](../docs/verification/2.0.0/generation-2/applications/native-calculators-build.json), [archive evidence](../docs/verification/2.0.0/generation-2/applications/native-calculators-bundles.json) and [application qualification](../docs/verification/2.0.0/generation-2/application-release.md).

All six exact downloaded bundles passed local file inventories, executable permissions, strict ad-hoc signatures, version 2.0.0 and actual native host/worker protocols on macOS 26.5.2. Protocol tests used isolated stores and no runtime PATH tools. The initial local archive verifier stopped because it omitted the intended root README and verification file from its expected entries; that harness assumption was fixed and the failed attempt retained. All application checks then passed. No application was abandoned.

The exact new Pocket Calculator bundle was also opened through native app control. Its window rendered native controls and About displayed `Version 2.0.0 (2.0.0)`. It was closed without calculating, editing, saving or exporting. This is a bounded launch/About spot check, not a repeat of all earlier visual workflows.

The apps still require macOS 26+ ARM64 and are ad-hoc signed, without Developer ID signing or notarization. Publication remains separate from these qualification results. Earlier candidate archives, reports and manual GUI sessions below retain their original identities.

## Generation-one 2.0.0 application candidate — superseded


All six engines were rebuilt from application commit `5d3286445587fec596b76f912f70cc1575679c75` using the qualified CI compiler `fdd021f30cdbb09165898beb01ce189d76af4d4714ad119640748695ba2e07d1`. All full numerical/storage suites, packaged host/worker protocols, strict signatures and ZIP roundtrip checks passed in [run 43475142800](https://github.com/HamzaArya/arya-lang/actions/runs/43475142800). The SDK includes the final exact decimal remainder and source-independent HTTP repairs. The About dialog now reads the bundle version instead of a hardcoded value.

- Final archive: `.build/release-2.0.0/final/arya-native-calculators-2.0.0-darwin-arm64.zip` (7,485,285 bytes).
- SHA-256: `e2851b0f0cd7b925b412dbac12189d533d2fa67fca3bcdd694f01bd1fc567f0b`.
- [Complete build evidence](../docs/verification/2.0.0/applications/native-calculators-build.json), [archive evidence](../docs/verification/2.0.0/applications/native-calculators-bundles.json) and [application qualification](../docs/verification/2.0.0/application-release.md).

All six exact downloaded bundles also passed file-inventory, signature and actual native protocol checks locally on macOS 26.5.2, with isolated stores and no runtime PATH tools. Pocket Calculator opened as a native window and its About dialog displayed `Version 2.0.0 (2.0.0)`; it was closed without saving calculations. This final spot check does not repeat the earlier complete GUI sessions below. No application was abandoned, and no new application defect occurred in the final rebuild. Local disk pressure prevented a new local compiler bootstrap; the qualified CI SDK and sequential remote app build completed the work instead. The full account is in the linked qualification report.

The apps require macOS 26+ ARM64. They are ad-hoc signed, not Developer ID signed or notarized; see [downloaded app guidance](../docs/installing.md#downloaded-macos-applications). Existing AppKit bundles do not run on Windows or Linux merely because Arya now has direct GTK/Win32 widget backends. All historical bundles, archives and reports below remain preserved and are superseded only as current release artifacts.

## Earlier local 2.0.0 preparation — superseded

All six engines were checked, rebuilt, and passed their complete smoke suites with the repaired Arya 2.0.0 compiler (`c5515eab20cb4a4a81b4a9d560f195108e6b916b05c72d491ccb7a0390ef71ee`). Programmer now calls the native UInt32 bitwise APIs; its 280 independent Python integer reference cases passed. Each bundle passed the actual AppKit host/worker protocol check and strict ad-hoc signature verification. No new engine or GUI-host failure occurred in this rebuild.

The isolated versioned output preserves the 66 files in the historical `dist/` bundles and the original ZIP. Bundle application versions are now 2.0.0. The release ZIP was extracted again; every bundled file hash, executable permission, and application signature matched. This build did not repeat the earlier manual GUI sessions: their host-source evidence remains below, while the latest protocol and numerical evidence is linked here.

- [Complete 6/6 build, tests and packaging](reports/20261113T164611.053395Z/results.json)
- [Current-source, architecture and worker-dependency reconciliation](reports/release-2.0.0-delivery.json)
- [Release ZIP verification](reports/release-2.0.0-bundles.json)
- Artifact: `.build/release-2.0.0/arya-native-calculators-2.0.0-darwin-arm64.zip` (7,531,323 bytes)
- SHA-256: `8f6854c4d7076dff9be2ccc75d7f49fdd6b3a1fd5e8b3e2fbddf5d6d1dc9149b`

These remain native AppKit applications for macOS 26 on Apple Silicon. They are ad-hoc signed and are not Developer ID signed or notarized. The new language's GTK and Win32 backends do not automatically port these existing AppKit applications.

The section above records the earlier local candidate. The current release identities are at the top of this report; the work records below preserve original development history.

Request: six calculators, one per previously requested developer skill level, retaining the latest requirement for real native desktop GUI software. Work is confined to `native-calculators/`; existing projects and compiler/runtime sources are preserved.

## Work performed

- Reused the previous verified AppKit process bridge as a starting point, then replaced the generic records interface with a calculator-specific face and adjacent searchable history.
- Added native expression input, editable cursor insertion, keypad, Backspace/Clear, Return/equal calculation, result reuse/copy, persistent setting selectors, optional memory keys, history reuse/clear/export, and bundled in-app guides.
- Kept numerical calculations inside compiled Arya engines. Worker arguments are structured JSON and are never passed to a shell. Bounded worker execution stays off the UI thread.
- Split six engines among three parallel implementation agents, each owning two disjoint project directories. Roles are simulated skill scopes; no human behavior or mistakes are fabricated.
- Added deterministic native icon artwork, atomic bundle publication, signature checks and project/config validation to the builder.

## Observed issues and resolutions

- The disk filled during the Everyday release build: clang reported `No space left on device`, the report JSON could not be written, and CUA could not create screenshot images. Pocket also surfaced the native disk-space failure without recording the calculation. Recovered 76,456,640 bytes by removing 42 regenerable generated C intermediates from `.build` directories in our earlier `developer-projects` and `native-desktop-projects` work. Their Arya sources, executable apps, tests and logs were retained. No unrelated files or caches were removed. Compilation was serialized afterward.
- A temporary helper filename collided between agents during ENOSPC handling. The attempted write failed, then the shell executed an existing helper. Both affected test files and all source/config hashes were checked against recorded evidence and were unchanged. Unique helper names were required afterward.
- Visual QA found the history panel did not fill the available window width. Added an explicit width constraint and fitted table columns. A host review also identified focus loss when asynchronous work re-enabled the expression field; focus is now restored after completion.
- Compiler and language constraints are addressed explicitly in the per-project reports. The programmer engine cannot rely on nonexistent Arya bitwise source operators. Decimal operations require explicit rounding arguments and obey runtime digit limits.
- Independent review reproduced `tan(990)` incorrectly returning a huge finite value in degree mode. Added a degree-mode pole check before radian conversion, with positive/negative and multiple-rotation regression cases.
- Independent review also found Scientific/Programmer accepted corrupted history results such as `NaN`. Both now validate every history result against the calculator's numerical domain; corruption regressions verify the saved file remains untouched.
- Worksheet history contains readable descriptions. Finance marks these rows `reusable:false`, allowing **Use selected** to insert the numeric result while retaining the original inputs in the history details.
- Native status messages now keep their hover text synchronized after exports and copy actions.
- A maximum compound-growth input exposed loss of requested low-order digits with 100-place worksheet working precision. Corrected the financial arithmetic to use directed 200-place scaled-integer bounds. A result is emitted only when both bounds round identically, or a bounded exact calculation confirms it. Added maximum-input reference tests and independent review against 300-digit Decimal/Fraction oracles.
- Review reproduced a predictable `.tmp` symlink corrupting a saved store, and dangling store links being mistaken for absence in four engines. Changed those engines to private sibling staging directories and direct file-type checks. Regression tests verify external sentinels and existing stores remain unchanged, dangling links fail visibly, and failed writes clean their staging directories. Scientific and Programmer already used those patterns.
- A separate review found exact half-cent loan/compound ties could round incorrectly even with extra working digits. Added exact branches/fallback and verified six one-/two-month tie examples independently. Worksheet totals, interest and growth use the same rounding certification. Values beyond the exact-fallback budget return an explicit precision-limit error rather than an uncertain answer; the guide documents that boundary.

## Verification status

All six calculators are complete within their documented bounds. No project was abandoned, and no known reproduced defect remains unresolved.

| Role / application | Final engine verification |
|---|---|
| Beginner / Pocket |87 compiled-worker calls passed |
| Better / Everyday |107 compiled-worker calls passed |
| Intermediate / Scientific |80 independent arithmetic references plus functions, angle/pole regressions, parser limits, memory and storage tests passed |
| Advanced / Programmer |280 Python integer reference cases plus overflow, bit patterns, parser limits and storage tests passed |
| Pro / Finance |254 compiled-worker calls passed, including 300-digit numerical references, exact ties, bounds and storage regressions |
| World class / Precision |233 compiled-worker calls passed, including exact fractions, 50-place previews, resource limits and storage regressions |

All six current Arya engines passed static checks and release compilation. All bundled apps passed strict ad-hoc signature verification and the actual native-host/worker protocol check. [DELIVERY-VERIFICATION.json](reports/DELIVERY-VERIFICATION.json) reconciles each current source/config/test/guide hash and packaged binary with complete engine-test evidence and the latest native-host packaging evidence. The host and workers are arm64 Mach-O binaries; workers depend only on the system library. No compiler, Node, Python or web runtime is required to run the apps.

[GUI-VERIFICATION.md](reports/GUI-VERIFICATION.md) records actual native-window workflows for all six, including keypad editing, keyboard input, restart persistence, memory, CSV export, angle/overflow controls, worksheet validation and corrected rounding, exact fractions and 50-place previews. Synthetic test histories were archived after verifying they contained only the entered QA expressions; apps are delivered with empty history.

The initial all-six pipeline pass and later targeted rebuilds remain in timestamped report folders. Package-only passes explicitly verify GUI packaging; they do not claim to repeat numerical tests. The delivery verifier links each final package to its independently completed engine tests, avoiding claims based on stale sources.

## Boundaries and remaining limitations

- Target: Apple Silicon macOS 26 or later, tested on this Mac. These are locally ad-hoc-signed applications, not notarized cross-platform releases.
- Beginner/everyday/scientific calculators use documented binary64 semantics. Programmer arithmetic is exact UInt32. Precision arithmetic has explicit 300-digit intermediate and expression-work limits.
- Finance worksheets model stated inputs and exclude fees and a cent-adjusted final-payment schedule. Certified rounding can report a precision-limit error when its bounded exact fallback cannot resolve an ambiguous boundary. The guide states this limitation.
- Atomic rename protects against partial replacement; these apps do not promise fsync-level recovery after sudden power loss. History is local, bounded to 100 entries, and exportable.

## Per-developer work records

- [Beginner report](01-beginner-basic/REPORT.md)
- [Better report](02-better-everyday/REPORT.md)
- [Intermediate report](03-intermediate-scientific/REPORT.md)
- [Advanced report](04-advanced-programmer/REPORT.md)
- [Pro report](05-pro-finance/REPORT.md)
- [World-class report](06-world-class-precision/REPORT.md)

Each project folder contains its complete source, native UI configuration, user guide, executable tests and development verification evidence. Build tools and the shared native host are in this collection. The original apps are retained in `dist/` and `Arya-Calculators-macOS-arm64.zip`; use the final versioned archive identified at the top for 2.0.0.
