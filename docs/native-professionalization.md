# Native Arya engineering audit and implementation

The later [runtime optimization report](native-fastpaths.md) identifies the subsequent candidate and its verification. The hashes and measurements below remain evidence for this earlier snapshot.

This report covers the professionalization work on the existing native `2.0.0-alpha.2` source line. It is an engineering qualification, not a declaration of stable production readiness. The starting checkout already contained uncommitted performance work; those changes were preserved. The implementation remains the self-hosted Arya frontend, C11 ahead-of-time backend and managed native runtime. Replacing that working architecture would have added migration risk without evidence of a benefit.

Work and measurements span November 12–13, 2026. The current library inventory and syntax contracts are in [the standard library](standard-library.md) and [the language reference](arya-language.md); installation routes are in [installing](installing.md).

## Findings and changes

| Priority | Evidence / root cause | Change and acceptance |
| --- | --- | --- |
| High: input validation executes accessors | Object validation called the ordinary property getter while inspecting external data. A getter incrementing a counter was accepted and executed. | Inspect descriptor slots first; reject accessors with a field path without invoking application code. Regression covers strict/nonstrict and nested schemas. |
| High: unchecked schema depth conversion | `schema.read` cast arbitrary doubles to C int, including NaN/infinity/out-of-range values. | Validate safe integer depth 0–64 before conversion; sanitizer tests cover malformed depths. |
| High: oversized trace error propagation | Inspection can reach the bounded JSON writer limit; tracing converted its undefined error result to UTF-8. | Propagate the existing exception before conversion; a wide nested value must produce a catchable error. |
| High: stale crypto build provenance | The OpenSSL pin was on an unsupported line, and a generic cached configure directory could reuse an earlier version while writing a new source hash. | Move to the verified available 3.5 LTS release and key the build directory by version and archive digest; retain upstream advisories and exact API applicability. |
| High: accounting aggregate balance is insufficient | Two individually invalid transactions can offset in one ledger. The original aggregate API correctly reports totals but cannot establish transaction validity. | Add explicit journal validation with per-transaction balance, one-sided nonzero postings, unique transaction IDs, immutable prepared snapshots, trial balances and financial statements. Existing diagnostic ledger behavior is preserved. |
| Medium: quadratic strict validation | Every input key scanned every schema key. | Reuse the native record index, bound issue collection and avoid unnecessary work once the 32-issue limit is reached. |
| Medium: excessive binary64 formatting work | Every `toFixed(2)` rendered 1074 decimal places and reparsed them through libmpdec. | Guarded exact significand/power-of-five integer rounding for 0–18 places, with existing libmpdec fallback. No approximate decimal multiplication, SIMD or assembly added. |
| Medium: diagnostic fidelity and cost | Logging retained all visited objects as circular; repeated aliases were mislabeled. Records and promise chains lacked useful inspection bounds. | Track the active ancestor path; bound object keys/promise traversal; add `logger.enabled(level)` to guard expensive diagnostic payload construction. |
| Medium: compiler recursion escapes its boundary | 600 unary `not` operators reported `ARYA_CLI: Native call depth exceeds 512` without a user location. | Include unary recursion in the 100-level expression budget; seeded malformed-source regression requires a source-located `ARYA_SYNTAX`. |
| Medium: distribution boundary depended on build order | Staging copied `share/`, silently bundling editor-host JavaScript if a VSIX had previously been built. `native-package` did not require all SDK dependencies. | Standalone staging excludes the optional adapter; package depends on full SDK; distribution gate rejects JS/CJS/MJS/VSIX tooling and verifies checksums. |
| Medium: historical qualification looked current | Retained qualification records describe the frozen release although current source files and binary can share its preview version string. | Preserve records but label them historical; add current source inventory, compiler/generated-C hashes and assembly metadata; require the distribution gate before packaging. |
| Medium: stale onboarding | Primary installation/tutorial/reference pages still described npm and retired native behavior. | Rewrite primary guides for the current native SDK, preserve historical Node documentation in `compat/node`, and explain optional host integrations. |

## Independent architecture and dependencies

The core compiler, checker, formatter, LSP, project creator, test runner and native CLI/server programs require no Node/npm/JavaScript execution. Core builds use POSIX tools, make and C11; full SDK builds additionally use C++20 for Ada URL and Perl for upstream OpenSSL configuration. Static native libraries provide decimal arithmetic, crypto, HTTP, URL and regex handling. Their pinned provenance and third-party notices remain in `native/PROVENANCE.json`.

| Component | Role and boundary |
| --- | --- |
| Retained C seed → self-hosted Arya frontend → C11 | Native bootstrap with stage-two/stage-three generated-C comparison; no JavaScript intermediate |
| Tagged values, roots and tracing collector | Managed strings, records, lists and closures; GC stress and instrumented generated programs check ownership paths |
| Cooperative tasks and bounded native workers | Async scheduling and blocking work; platform scheduler portability remains open |
| mpdecimal 4.0.1 / checked fixed-point integers | General exact decimal arithmetic / bounded accounting amounts |
| OpenSSL libcrypto | Established cryptographic primitives; version, archive checksum and configuration recorded in provenance |
| llhttp 9.4.3 / Ada 4.0.0 / PCRE2 10.49 | Vendored C HTTP parser / native URL parser / bounded Unicode regex; upstream project origins do not create an execution dependency on Node |
| Ryu / Unicode 17 tables | Native number conversion / committed character tables with retained licenses and provenance |

The standalone SDK contains no JavaScript or VSIX tool files. The optional VS Code adapter is built separately and explicitly executes transport code in its editor host. Browser UI and macOS WebKit features still execute JavaScript in their browser environment; these explicit host integrations are outside the core independence claim. Python starts only for explicit foreign calls. MySQL needs an external native client. The retained Node source and optional Node reference controllers remain archival/comparison material and are excluded from primary build and distribution dependencies.

The [dependency review](native-dependency-review.md) records upstream releases and integrity checks. OpenSSL moved from 3.6.4 to the available supported 3.5.9 LTS release; the [crypto review](native-security-debugging.md#dependency-audit-13-november-2026) explains the announced December 1 fixes and their API scope. The runtime's exposed primitives were not replaced with custom cryptography.

`make native-clean-test` copies a source-only workspace without editor adapter sources, builds the complete SDK, tests native programs, compares bootstrap C generations, packages and relocates the SDK, verifies hashes, inspects linked dependencies, and runs generated executables with `PATH=/nonexistent`. Its build PATH excludes Node/npm/Python/Bun/Deno/QuickJS/JavaScriptCore commands. This demonstrates interpreter independence through a restricted environment; it does not claim those programs were uninstalled from the host OS.

## Library contracts

Accounting additions use exact strings and existing checked fixed-point limits. `validateTransaction`, `prepareJournal`, `journalBatch`, `trialBalance`, and `financialStatements` add explicit `journal-v1`, `trial-balance-v1`, and `statements-v1` policies. Reports require supplied account classifications. They implement calculations rather than persistence, period selection, authorization or regulatory certification. See [accounting contracts](accounting-engine.md) and `native/examples/journal-report.arya`.

Validation, established OpenSSL primitives, structured logging, bounded inspection and disabled-trace guards are documented in [security and debugging](native-security-debugging.md), with `native/examples/secure-service.arya`. Cryptography primitives were retained rather than replaced with custom implementations.

Intentional changes: validation rejects input accessors instead of invoking them; invalid schema depths fail explicitly; default inspection truncates records after 50 keys (configurable to 1000); extremely nested unary expressions produce a syntax diagnostic; standalone SDKs no longer carry the optional editor adapter. Existing release archives are immutable and retain their original contents.

## Reproduce the gates

```sh
make native-sdk
make check
python3 native/tests/parser-fuzz.py --compiler .build/independent/arya
python3 native/tests/number-format-reference.py
python3 native/tests/number-format-reference.py --sanitize
python3 native/tests/decimal-reference.py
python3 native/tests/types-reference.py .build/independent/arya
python3 native/tests/lsp-reference.py .build/independent/arya
make native-clean-test
```

Python is an optional test oracle/controller. `make check` and the clean source acceptance require no Python or Node. Meaningful regression tests exercise invalid inputs, snapshots, exact output, side effects, crypto tampering, exceptional cleanup and optimized/reference execution rather than only checking API existence.

Before/after evidence retains binary/generated-C hashes, raw samples, environment and checksums; formatting and toolchain reports also retain compiler hashes. Formatting measures complete warmed formatting loops with an independent Python integer-ratio oracle. Validation measures wide strict schemas with matching results. Both exclude compilation/startup from kernel CPU measurements. Build timing and output size are separate fields, not silently mixed with execution speed.

The [formatting investigation](native-number-format.md) also isolates one function change in otherwise identical generated C and records allocation counters. Existing [Node comparisons](native-data-performance.md) remain evidence for their recorded snapshots: JavaScript still leads several dynamic collection, JSON and string workloads. They were not rerun or relabeled as results for this patch. JavaScript is a language and Node is one runtime; no single speed ratio describes either comparison.

## Verification evidence

The final local compiler SHA-256 is `6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`. Pre-existing source changes and simultaneous host activity mean version strings alone do not identify a tested build. Use recorded hashes and source manifests. The starting-checkout context file is an audit snapshot from ongoing work, not a pristine commit or a substitute for the preserved benchmark binaries.

On macOS 26.5.2 ARM64 with the native C11 release backend, nine alternating fresh-process samples gave these process-CPU medians. Compilation, setup and startup are outside these timed kernels:

| Workload | Before ms | After ms | Before / after |
| --- | ---: | ---: | ---: |
| Binary64 `toFixed(2)`, 40000 calls | 516.929 | 63.966 | 8.08 |
| Binary64 `toFixed(18)`, 40000 calls | 486.883 | 61.401 | 7.93 |
| Strict validation, 50 × 128 fields | 4.761 | 2.413 | 1.97 |
| Strict validation, 50 × 512 fields | 68.175 | 10.603 | 6.43 |

Full qualification builds were active during measurement; raw load and sample ranges are retained. The formatter also has a separate isolated comparison changing only that function in identical generated C. Its precision-100 fallback ranges overlap, so no fallback gain is claimed. Allocation counters show one fewer temporary allocation per common-format call; managed peak memory and observed RSS did not materially improve. Validation results describe the integrated candidate with matching outputs, not an isolated attribution to one instruction. See [formatting raw samples](benchmarks/2.0.0-alpha.2-number-format-integrated-2026-11-13.json), [allocation samples](benchmarks/2.0.0-alpha.2-number-format-allocation-2026-11-13.json), and [validation raw samples](benchmarks/native-data-2026-11-12/validation-comparison.json).

Separate wall-time measurements retained costs outside the execution kernels:

| Toolchain operation | Before median ms | After median ms |
| --- | ---: | ---: |
| Check hello source | 11.549 | 11.126 |
| Check quoted 64 KiB text | 62.963 | 76.108 |
| Check raw 64 KiB text | 83.014 | 84.976 |
| Force release build of hello | 1263.347 | 1428.384 |
| Launch built hello executable | 3.878 | 3.926 |

These are observations under contention, including increases, not a causal claim of improvement or regression. One-minute load ranged from 12.06 to 14.27 on eight logical CPUs. There were nine check/startup samples and three forced-build samples per SDK, one discarded warmup per operation, alternating order and warm filesystem caches. Check includes process launch, loading, lexing, parsing and type analysis; compilation includes frontend, C emission, Apple Clang 21 `-O2` and linking. Isolated parser CPU time was not measured. Hello grew from 367304 to 367368 bytes; the compiler grew from 5683016 to 5749112 bytes. A quiet-host repeat is needed before attributing these wall-time changes. See [complete toolchain samples, commands and identities](benchmarks/professionalization-2026-11-12/toolchain.json).

Completed focused and reference checks:

- Accounting: 503 optimized and 503 reference assertions, 128 sanitizer/GC-stress assertions, typed reports and five rejected incorrect annotations; 85 independent financial batches with 7600 rows, four scales and nine rounding modes; working journal report example.
- Security/debugging: 67 assertions in each release/sanitized mode with collector stress; uncaught source-stack checks; 11 crypto vectors/round trips against linked OpenSSL 3.5.9; working redacted-log example. Disabled trace guards used 148 counted allocations for both 100 and 10000 iterations.
- Formatting: focused release/sanitized fixture and 3354 independent exact-rational cases in each mode. Decimal: 5532 results matched pure-Python arithmetic.
- Compiler and tooling: stage-two/stage-three C convergence; 266 parser cases with a source-located unary-nesting diagnostic; 105 type/flow cases; LSP transport, diagnostics, navigation, rename, signatures, formatting, tokens and fixes.

`make check` passed the complete native, sanitizer/profile and standalone distribution gates. The [retained log](benchmarks/professionalization-2026-11-12/check.log) includes all invoked suites. The [same trace-overflow source](benchmarks/professionalization-2026-11-12/trace-overflow.arya) that crashed the baseline now catches its bounded-output error; [binary identities and outcomes](benchmarks/professionalization-2026-11-12/trace-overflow.json) are retained.

`make native-clean-test` also passed end to end from a new source-only workspace. It rebuilt all native dependencies and three compiler generations, ran the entire native/profile/distribution suite with interpreter commands excluded, packaged the SDK without AppleDouble metadata, verified checksums, extracted to a path containing spaces and an apostrophe, built through a compiler symlink, and executed installed decimal/service programs with `PATH=/nonexistent`. Linked-dependency inspection found no Node, V8, Python, QuickJS or JavaScriptCore linkage in the tested compiler/programs. This does not claim that interpreters were physically uninstalled from the host.

The [qualification record](benchmarks/professionalization-2026-11-12/qualification.json), [clean acceptance log](benchmarks/professionalization-2026-11-12/clean-acceptance.log), [compressed full build log](benchmarks/professionalization-2026-11-12/clean-verification.log.gz) and [dependency listing](benchmarks/professionalization-2026-11-12/dependencies.txt) preserve the commands, source/binary identities, environment and limits. The first wrapper attempt stopped after an in-flight script edit; packaging subsequently passed from that workspace, and the frozen wrapper then passed in a separate fresh workspace. The failure is retained rather than hidden.

An unpublished candidate SDK is assembled under `artifacts/native-professionalization-2026-11-13/`, separate from the immutable release archives. It retains the preview version string; identify it by checksums and `BUILD-INFO.txt`. No external publication or stable-production claim is made. Performance measurements do not establish universal superiority over Node or earlier unrelated workloads.

## Remaining work and risks

- Only the actually executed host gates establish local qualification. Windows, Linux release delivery, other CPUs and cross-compilation remain separate work.
- The runtime still uses cooperative tasks and tracing GC. Dynamic object/JSON workloads still lag the recorded Node kernels; this pass does not claim to solve them all.
- macOS `getcontext`/`makecontext`/`swapcontext` deprecation warnings identify a scheduler portability obligation. They are not hidden or treated as a solved issue.
- A public stable embedding ABI, native debug adapter, package registry, versioned compatibility guarantees and independent learner sessions remain unfinished.
- HTTP/1 has no built-in TLS. Explicit Python, MySQL, desktop and editor host integrations retain their own dependencies and acceptance gates.
- Sanitizers use `detect_leaks=0` on this macOS host; no leak-detector qualification is claimed.
- The sanitizer gates instrument generated programs and runtime wrappers; prebuilt upstream static libraries are not sanitizer-instrumented. Caught errors do not expose `.stack`; native source frames are printed for uncaught exceptions.
- Financial reports require business review of classification/period conventions. IDs are unique within a prepared batch, not a persistent idempotency database.
- Development-machine measurements can contain scheduling and memory-pressure noise. Kernel improvements cannot be extrapolated to application throughput or startup.
