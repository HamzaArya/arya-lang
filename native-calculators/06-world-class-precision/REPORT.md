# Precision Calculator — developer report

## Implemented work

Built a native exact-rational calculator engine and AppKit face definition for the world-class persona. The engine parses a finite grammar directly and performs reduced fraction arithmetic using arbitrary-precision decimal-string integers. It returns parenthesized noninteger fractions so continued powers/operators preserve the entire result. Decimal previews have independently selected precision/rounding; memory preserves exact fractions.

Read the shared calculator protocol and native decimal implementation first. The native 1024-character string limit and 0–100-place division contract informed the 300-digit reduced numerator/denominator budget. Implemented Euclidean GCD with exact integer quotient/remainder, denominator-GCD addition, cross-cancelled multiplication, right-associative bounded integer powers and explicit precedence. No expression evaluator, HTTP, browser UI or Python runtime is used.

Added canonical stored-value validation, bounded history, persistent last-result/memory, atomic saves and rejection without mutation. Tests compare fixed and seeded random cases against Python's independent Fraction and high-precision Decimal oracles. They cover negative ties, 50-place previews, large integers, parser/resource limits, retained history, fresh-process persistence, corrupt files and failed writes.

## Actual friction and decisions

- Shared disk exhaustion prevented the first source-generator write. Root was notified immediately; compilation was paused while root recovered space from task-owned generated C intermediates. Sources were then written successfully, and the two calculator builds ran sequentially. Unrelated caches and existing app sources were untouched.
- There is no public native integer modulo API. For nonnegative GCD operands the engine calculates `a - quotient*b`, with `quotient = decimal.divide(a,b,0,"down")`. An early native probe verified the quotient/remainder contract before using it in fraction reduction.
- Fraction text needed parentheses for reliable calculator continuation: returning bare `2/3` followed by `^2` would parse differently. The engine returns `(2/3)` and tests continued powers against the exact oracle.
- Arbitrary precision is explicitly resource-bounded. Unsupported symbolic/transcendental requests, fractional powers and oversized intermediates produce errors; they are not approximated silently or advertised as supported.
- Native builds emitted the repository's existing macOS `ucontext` deprecation warnings and succeeded. No compiler/runtime changes were made.

## Verification and completion

The initial native check/build passed, followed by 225 successful worker calls. Added continuation regressions to the final suite; final counts/source hashes are recorded in verification evidence. Every command launches a fresh executable process, exercising persistence throughout. The application engine and face definition are complete within the README's explicit bounds; no intended bounded workflow was abandoned.

The root supplies and verifies the native AppKit calculator face, final `.app` packaging and signatures. Those GUI checks are recorded separately from numerical engine verification. The persona label is a simulated development brief, not a claim of human participants or production certification.

## Independent review and corrected persistence

Independent review reproduced a data-loss bug in the initial fixed temporary path: if `data.json.tmp` was a symlink to `data.json`, writing and renaming it could replace the store with a self-referential symlink. A separate loader bug treated a dangling store symlink as an absent file because `existsSync` follows links. The original happy-path and unwritable-`.tmp` tests did not cover either condition.

The loader now uses `infoSync` (lstat) directly and rejects every non-regular store, including existing and dangling symlinks. Saving creates a private sibling `data.json.stage-XXXXXX` directory, writes its own data file and renames that file over the store. Cleanup removes the private file/directory on failure. Legacy `.tmp` paths are ignored. Regression tests preserve an existing store target and an unrelated sentinel behind poisoned `.tmp` links, reject existing/dangling DATA_FILE links without replacement, and assert staging directories are cleaned. Real write failure is induced in the test subprocess with a zero file-size resource limit and ignored SIGXFSZ; no runtime test hook or permission assumption is required.

Both corrected engines passed fresh native checks, release builds and the expanded numerical/persistence suites. Local `verification.json` and root final packaging evidence supersede the earlier binary hashes.
