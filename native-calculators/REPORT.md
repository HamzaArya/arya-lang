# Calculator delivery report

## Arya 2.0.0 rebuild and distribution

All six engines were checked, rebuilt, and passed their complete smoke suites with the repaired Arya 2.0.0 compiler (`c5515eab20cb4a4a81b4a9d560f195108e6b916b05c72d491ccb7a0390ef71ee`). Programmer now calls the native UInt32 bitwise APIs; its 280 independent Python integer reference cases passed. Each bundle passed the actual AppKit host/worker protocol check and strict ad-hoc signature verification. No new engine or GUI-host failure occurred in this rebuild.

The isolated versioned output preserves the 66 files in the historical `dist/` bundles and the original ZIP. Bundle application versions are now 2.0.0. The release ZIP was extracted again; every bundled file hash, executable permission, and application signature matched. This build did not repeat the earlier manual GUI sessions: their host-source evidence remains below, while the latest protocol and numerical evidence is linked here.

- [Complete 6/6 build, tests and packaging](reports/20261113T164611.053395Z/results.json)
- [Current-source, architecture and worker-dependency reconciliation](reports/release-2.0.0-delivery.json)
- [Release ZIP verification](reports/release-2.0.0-bundles.json)
- Artifact: `.build/release-2.0.0/arya-native-calculators-2.0.0-darwin-arm64.zip` (7,531,323 bytes)
- SHA-256: `8f6854c4d7076dff9be2ccc75d7f49fdd6b3a1fd5e8b3e2fbddf5d6d1dc9149b`

These remain native AppKit applications for macOS 26 on Apple Silicon. They are ad-hoc signed and are not Developer ID signed or notarized. The new language's GTK and Win32 backends do not automatically port these existing AppKit applications.

The work records below describe the original delivery and its development history; the linked 2.0.0 evidence supersedes the original binary/source reconciliation for the new release.

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

Each project folder contains its complete source, native UI configuration, user guide, executable tests and development verification evidence. Build tools and the shared native host are in this collection. Apps are in `dist/`; the distributable archive is `Arya-Calculators-macOS-arm64.zip`.
