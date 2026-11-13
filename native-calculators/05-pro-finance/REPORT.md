# Finance Calculator — developer report

## Implemented work

Built a native calculator engine and AppKit face configuration for the pro persona: exact expression arithmetic with controlled final rounding, persistent decimal memory/history and three finance worksheets. `main.arya` owns commands/state/worksheets; `rational.arya` owns tokenization, recursive-descent parsing, exact fraction arithmetic and formatting. The root supplies the actual AppKit face and bundle; no browser UI or supplied-code evaluation is used. This is a simulated developer brief, not a human-participant study.

Read the shared protocol and decimal runtime before implementation. Native decimal inputs/results are bounded to 1024 characters and division/quantization require explicit rounding and 0–100 places. An early native probe verified a 30-digit quotient and remainder (`52`), negative tie rounding and a 100-place decimal division. Implemented exact remainder/GCD using integer division, then cross-cancelled fraction operations. Ordinary expressions round once at the output boundary. The initial loan/compound implementation used 100-place working arithmetic; independent review later exposed errors, corrected below.

Implemented precedence/unary/power/percent rules, memory arithmetic, schema validation, atomic persistence, latest-100 retention and finite resource budgets. Tests use independent Fraction/Decimal arithmetic, seeded random expressions and known finance examples. Extreme worksheet tests include a 30-digit principal, tiny annual rate, 600 payments and 50-place output compared against a 250-digit Decimal reference.

## Actual problems and resolutions

- The filesystem became full before the first generator script could be written: the shell reported `no space left on device`. No app source was partially created by that failed command. Reported the blocker immediately and paused compilation. Root recovered space by removing only generated C intermediates from task-owned prior build folders; sources, executables and logs were retained. Source writing resumed and builds ran sequentially after coordination.
- Native decimal has no public integer modulo function. Implemented remainder as `a - floor(a/b)*b` for nonnegative GCD operands, verified with the native probe, and bounded integer sizes to stay below the library ceiling. This was a supported arithmetic construction, not a compiler modification.
- Worksheet history labels are readable descriptions rather than executable expressions. Root added a `reusable:false` row hint; worksheet rows use it so native **Use selected** inserts their numeric result instead of the descriptive label. Ordinary expression history remains reusable.
- Existing runtime `ucontext` deprecation warnings appeared during native compilation; builds succeeded. No compiler/runtime or earlier app sources were changed.

## Evidence and limits

The initial release build passed and 238 native worker calls passed the original test suite. Added returned-result continuation tests and hard-coded known worksheet examples; the expanded numerical/state suite passed before the final history hint. The root's final fresh build/test/package pass verifies the final hint and frozen sources. Exact command counts and hashes appear in local/root verification evidence.

Explicit limits and worksheet assumptions are in README. No promised bounded workflow was abandoned. Actual native-window testing and bundle/signature verification belong to the root integration evidence; engine tests alone do not claim GUI verification.

## Independent review and corrected persistence

Independent review reproduced a data-loss bug in the initial fixed temporary path: if `data.json.tmp` was a symlink to `data.json`, writing and renaming it could replace the store with a self-referential symlink. A separate loader bug treated a dangling store symlink as an absent file because `existsSync` follows links. The original happy-path and unwritable-`.tmp` tests did not cover either condition.

The loader now uses `infoSync` (lstat) directly and rejects every non-regular store, including existing and dangling symlinks. Saving creates a private sibling `data.json.stage-XXXXXX` directory, writes its own data file and renames that file over the store. Cleanup removes the private file/directory on failure. Legacy `.tmp` paths are ignored. Regression tests preserve an existing store target and an unrelated sentinel behind poisoned `.tmp` links, reject existing/dangling DATA_FILE links without replacement, and assert staging directories are cleaned. Real write failure is induced in the test subprocess with a zero file-size resource limit and ignored SIGXFSZ; no runtime test hook or permission assumption is required.

Both corrected engines passed fresh native checks, release builds and the expanded numerical/persistence suites. Local `verification.json` and root final packaging evidence supersede the earlier binary hashes.

## Independent review and corrected worksheet rounding

The original 100-place working arithmetic failed an allowed extreme compound calculation: principal `999999999999999999999999999999`, annual rate `100`, months `1200`, output precision `50`. Digits diverged after 24 fractional places from a 300-digit Decimal oracle. Review also found a more fundamental tie problem: a one-month loan of `6` at 1% APR under Half up returned `6.00` instead of exact `6.01`; principal `18` with Half even returned `18.01` instead of `18.02`. Simply raising working precision would not establish correct tie handling.

The replacement uses scale `10^200` integer coefficients and conservative Floor/Ceiling bounds. Compound growth is monotone in the factor. For positive-rate loans, `factor/(factor-1)` decreases as the factor grows, so the lower payment pairs the lower rate with the upper factor and the upper payment uses the opposite pairing. Payment, total, interest and growth are each rounded from both bounds; a number is emitted only if those rounded bounds agree. Zero-rate and one-period formulas are evaluated directly and exactly. An ambiguous boundary invokes the existing bounded exact-rational engine; if the fallback exceeds its limits, the request fails visibly without changing state.

Tests now include maximum compound and loan magnitudes at all 50 output places against 300-digit references, exact single-month ties, and multi-period loan/compound ties that exercise the exact fallback. The corrected Finance suite passes **254 native worker calls**; the corrected Precision suite passes **233**. The numerical limits and possible explicit precision-limit error are documented in README. No failed value is presented as a completed calculation.

## 2.0.0 remainder API integration

The language now supplies exact `decimal.remainder` and `decimal.values.remainder`. The GCD helper uses `decimal.remainder(a, b)` instead of constructing quotient, product and subtraction in application code. Its nonnegative operands retain the same mathematical result. This closes the previously reported missing public integer remainder API; the new operation also supports finite decimal fractions with dividend-sign remainder semantics. A fresh release build and complete numerical/storage suite are required after this migration; earlier bundle hashes remain historical evidence.
