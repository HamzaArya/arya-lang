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

Open the applications in `dist/`. Each has native macOS controls, an editable expression, a numeric/function keypad, a result display, persistent history, search, CSV export, and an in-app Guide. Specialized controls depend on the calculator. Press Return or `=` to calculate. Use **Use result** to continue from the displayed result, or select a history row and choose **Use selected** to edit its expression. Error messages appear in the status bar. Hover over clipped results or status text to read the full text; **Copy result** copies every digit.

Arithmetic, expression parsing, memory, validation, worksheet logic and persistence are implemented in Arya and compiled into each app's `arya-worker`. The shared Objective-C AppKit host implements windows, controls and file dialogs. There is no HTML, embedded browser, web server, JavaScript evaluation, or Python/Node runtime dependency. This is a native GUI bridge, not a claim that Arya directly supplies AppKit widgets.

History is local to `~/Library/Application Support/Arya Native/calc-*/data.json`. The calculators retain up to 100 history entries and refuse corrupt data instead of silently replacing it. The File menu can reveal the data folder. Each application locks its own store to prevent two GUI instances from modifying it concurrently. Individual project guides document numerical semantics and resource limits. These limits are part of the supported product, not unfinished functionality.

## Build and verify

Requirements: the repository's native `bin/arya` compiler, Apple's command-line developer tools, and Python 3 for build/test tooling only. Built apps target Apple Silicon macOS 26 or later, matching this workspace's tested environment.

```sh
python3 native-calculators/build.py
```

The builder checks and compiles each Arya engine, runs its isolated numerical/storage tests, packages the native GUI and guide, generates a distinct icon, ad-hoc signs each app, verifies signatures, and runs the bundled host/worker protocol check. Build evidence is written to timestamped folders under `reports/`. `--filter 01-` selects a project; `--package-only` is an explicitly partial verification mode for GUI iteration.

Run `python3 native-calculators/verify-delivery.py` to match all six delivered bundles against their current source hashes and complete build/test evidence.

See `REPORT.md` for the actual work, issues, fixes and final verification. Every project includes its own `REPORT.md`, `README.md`, and executable test suite. The earlier 18 projects and six desktop applications remain in their original folders.
