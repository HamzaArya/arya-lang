# Six native Arya calculators

Six separate macOS desktop applications, organized by increasing developer skill and mathematical scope. The skill labels describe simulated developer roles and project scope; they do not represent six human developers.

| Role | Source folder | Application and scope |
|---|---|---|
| Beginner | `01-beginner-basic` | Pocket Calculator — one-operation arithmetic |
| Better | `02-better-everyday` | Everyday Calculator — expressions, percentages, square roots, memory |
| Intermediate | `03-intermediate-scientific` | Scientific Calculator — functions, powers, angle modes |
| Advanced | `04-advanced-programmer` | Programmer Calculator — unsigned 32-bit arithmetic and bitwise operations |
| Pro | `05-pro-finance` | Finance Calculator — decimal calculations and financial worksheets |
| World class | `06-world-class-precision` | Precision Calculator — exact rational arithmetic and decimal previews |

The current 2.0.0 archive is `../.build/release-2.0.0/generation-2/final/arya-native-calculators-2.0.0-darwin-arm64.zip`; extract it and open a calculator or copy it to Applications. The full SDK is not needed to run it. [Final application qualification](../docs/verification/2.0.0/generation-2/application-release.md) identifies the archive and all six fresh engine-test results. Earlier delivery bundles remain in `dist/` and their original archives. Each has native macOS controls, an editable expression, a numeric/function keypad, a result display, persistent history, search, CSV export, and an in-app Guide. Specialized controls depend on the calculator. Press Return or `=` to calculate. Use **Use result** to continue from the displayed result, or select a history row and choose **Use selected** to edit its expression. Error messages appear in the status bar. Hover over clipped results or status text to read the full text; **Copy result** copies every digit.

Arithmetic, expression parsing, memory, validation, worksheet logic and persistence are implemented in Arya and compiled into each app's `arya-worker`. The shared Objective-C AppKit host implements windows, controls and file dialogs. There is no HTML, embedded browser, web server, JavaScript evaluation, or Python/Node runtime dependency. These calculators retain the AppKit bridge developed for the original delivery. Arya 2.0.0 also now provides the separate direct [`std gui` widget API](../docs/native-gui.md) for new native applications.

History is local to `~/Library/Application Support/Arya Native/calc-*/data.json`. The calculators retain up to 100 history entries and refuse corrupt data instead of silently replacing it. The File menu can reveal the data folder. Each application locks its own store to prevent two GUI instances from modifying it concurrently. Individual project guides document numerical semantics and resource limits. These limits are part of the supported product, not unfinished functionality.

These macOS 26+ Apple Silicon apps are ad-hoc signed, with no Developer ID signature or Apple notarization. macOS may block a downloaded app on first launch. Compare the archive checksum with the official release and see the [installation and signing notes](../docs/installing.md#downloaded-macos-applications); signature verification here establishes bundle integrity, not publisher identity.

## Build and verify

Requirements: the repository's native `bin/arya` compiler, Apple's command-line developer tools, and Python 3 for build/test tooling only. Built apps target Apple Silicon macOS 26 or later, with final bundles also checked on macOS 26.5.2. Their compiler SDK has a separate macOS 15 minimum; that does not lower these apps' macOS 26 minimum.

```sh
python3 native-calculators/build.py
```

The builder checks and compiles each Arya engine, runs its isolated numerical/storage tests, packages the native GUI and guide, generates a distinct icon, ad-hoc signs each app, verifies signatures, and runs the bundled host/worker protocol check. Build evidence is written to timestamped folders under `reports/`. `--filter 01-` selects a project; `--package-only` is an explicitly partial verification mode for GUI iteration.

To build a new version without replacing the earlier bundles, pass `--output /absolute/path/to/new-bundles --app-version 2.0.0`. The 2.0.0 build uses the frozen release compiler and records its SHA-256 along with each tested worker.

The [final CI build report](../docs/verification/2.0.0/generation-2/applications/native-calculators-build.json) records all six complete engine suites. [Final bundle verification](../docs/verification/2.0.0/generation-2/applications/native-calculators-bundles.json) records the final ZIP hash, extracted signatures and historical-bundle preservation. Earlier `reports/release-2.0.0-*.json` files remain evidence for the superseded local candidate.

See `REPORT.md` for the actual work, issues, fixes and final verification. Every project includes its own `REPORT.md`, `README.md`, and executable test suite. The earlier 18 projects and six desktop applications remain in their original folders.
