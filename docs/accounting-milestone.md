> Historical implementation guide. The original is preserved in [compat/node/docs/accounting-milestone.md](../compat/node/docs/accounting-milestone.md). Current native behavior is defined by the [native profile](native-profile.md), [SDK guide](native-sdk.md) and [qualification report](native-independence-report.md).

# Accounting foundation milestone — alpha.11

This report records the bounded first milestone under the
[master requirements](arya-master-plan.md). It covers the architecture audit,
target architecture, staged migration plan, and a working exact invoice/ledger
runtime with an optional native calculation kernel. The application runtime remains
Node.js. A typed IR and standalone native executable backend are future milestones.

## Implemented behavior and compatibility

- Exact invoice gross/discount/net/tax/total and ordered ledger aggregates.
- Explicit money scale, fractional unit-price scale, six-digit quantities/rates,
  nine signed rounding rules and checked signed 64-bit line/input bounds.
- Exact aggregate strings, immutable snapshots/results, reusable parsed columns,
  explicit JS/native/auto selection and cooperative async cancellation/backpressure.
- A standalone runtime package without npm runtime dependencies or install scripts;
  an optional Node-API 9 C++17 kernel and portable BigInt fallback.
- Architecture audit/gap analysis, target architecture, staged roadmap, normative
  library boundary, examples, independent Decimal tests and optional native CI.

No language syntax or existing numeric behavior changes. Existing `std "decimal"`,
Node/Python bridges, UI and database contracts remain the compatibility baseline.
The compiler/editor identities are alpha.11 / 1.3.6. Published alpha.9 and retained
alpha.10 archives are preserved. Native runtime packages still require Node.js.

## Executed verification

Local platform: **macOS ARM64, Apple M1, Node 24.16.0, Python 3.13.15, Apple Clang 21**.

| Gate | Observed result |
| --- | --- |
| `npm run check` with serial test files | Docs, core formatting, TypeScript, build and regression checks passed; **359 passed, 0 failed, 4 optional skips** |
| `npm run build:accounting-native -- --sanitize` | C++ core AddressSanitizer/UndefinedBehaviorSanitizer checks passed; macOS leak detection unavailable and explicitly not run |
| `ARYA_TEST_ACCOUNTING_NATIVE=1 npm run test:accounting` | **15 passed**, no skips; native execution required rather than silently falling back |
| `npm run test:accounting-package` | Both archives passed independent offline/fresh-cache installs, CJS/ESM imports, exact outputs, forced fallback, standalone TypeScript and an Arya consumer |
| Node 22.15.0 and 26.13.0 compatibility | Each passed all 15 accounting cases with native required, and both independent archive-consumer checks; the same Node-API binary was used |
| Accounting example | Printed `42.89` and `true 0.00` |
| Full accounting benchmark | **40 worker cases**, including one-million-row invoices/ledgers, with matching output hashes per equivalent workload |
| Alternating same-process comparison | Nine paired samples for each of eight workloads; both backends produced identical results |

The four full-suite skips are optional Chrome/Electron/live-MySQL integration
checks. Their earlier alpha.10 evidence is historical; these integrations have not
been rerun for alpha.11. The new native CI workflow is prepared, not remotely
executed. Cross-runtime and clean-snapshot results are retained in
`.build/evidence/alpha11-accounting/` and `artifacts/QUALIFICATION-1.3.0-alpha.11.json`;
only completed commands in those records count as evidence.

The financial oracle uses a separate Python Decimal implementation with 100-digit
precision: 45 seeded invoice scenarios, 80 lines each, across scales, signs, all
rounding modes, fractional prices and fractional rates. Native boundary cases also
cover malformed/shared/detached buffers and worker environments. Overflow and
cancellation return no partial totals, with original global row positions.

## Measured performance and size

[Raw measurements](benchmarks/1.3.0-alpha.11-accounting.json) retain all samples,
source/binary/toolchain identities, output hashes, RSS, cold-process observations
and the alternating comparison. Commands:

```sh
npm run benchmark:accounting
node --expose-gc scripts/benchmarks/accounting-paired.mjs
```

Selected **prepared** medians in milliseconds, seven warmed samples:

| Workload | Decimal wrapper | Parsed Decimal batch | Portable BigInt | Native kernel |
| --- | ---: | ---: | ---: | ---: |
| 100,000 invoice lines | 1,899.09 | 500.67 | 27.32 | 7.52 |
| 1,000,000 invoice lines | Not run | Not run | 178.83 | 78.94 |
| 100,000 ledger entries, 128 accounts | Not run | Not run | 4.77 | 0.30 |
| 100,000 ledger entries, 100,000 accounts | Not run | Not run | 52.80 | 58.18 |

Decimal comparisons are equivalent arithmetic on valid bounded data, not equal
public APIs. They use the same stage rounding and exact output hashes; they do
not establish a replacement for general decimal arithmetic.

Preparation changes the conclusion. The isolated million-line invoice workers
measured about **1.55 s JS / 1.57 s native** including validation/parsing. Alternating
100,000-line invoice calls measured **1.06 s JS / 2.04 s native**, while the paired
100,000-entry / 128-account ledger measured **196.7 ms JS / 150.4 ms native**.
These runs did **not** demonstrate uniformly faster end-to-end applications.

Host load was substantial during paired measurements: one-minute load average
18.82 on eight logical CPUs, with about 157 MB free of 8 GB physical memory.
Startup and elapsed timings varied materially. Treat these as exploratory local
measurements, not dedicated performance qualification or a universal speed claim.
The dependable improvements are explicit exact batch arithmetic, reuse of parsed
inputs and independent small-runtime deployment. Re-profile an actual application
on a controlled host before tuning auto thresholds or promising latency gains.

Standalone executable JavaScript: **18,639 bytes**; optional native binary:
**55,184 bytes**. Compressed reviewed runtime archives:

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `arya-accounting-1.3.0-alpha.11.tgz` | 19,595 | `3bcde2f10835d8934f31b7961874ab579497fadd381e76834d0f253c2f955706` |
| `arya-accounting-1.3.0-alpha.11-darwin-arm64.tgz` | 29,142 | `c1512b5e34c530707e8451633b72b61b12203d528d24cd60343a717329302887` |

These package sizes exclude the application's Node executable, dependencies and
business data. RSS samples include benchmark data/setup and are retained as
observations, not a claim of fixed application memory use.

## Failures found and corrected

- A Clang warning promoted to an error exposed an ambiguous mixed boolean
  expression in buffer validation; explicit grouping corrected it.
- LeakSanitizer is unsupported by the available macOS sanitizer. ASan/UBSan run;
  leak checking is reserved for supported Linux runs and is never reported as passed here.
- An intentionally invalid getter test needed an explicit boundary cast for
  TypeScript. The correction preserves runtime rejection of accessors.
- Standalone package acceptance found inferred `NodeJS.Platform`/`Architecture`
  types relying on development-only Node declarations. An explicit public
  information interface removes that dependency; independent type checking passes.
  Rejected preliminary archives are retained under
  `artifacts/retained/accounting-alpha11-rejected-declarations/`.
- Native execution was slower on some small/account-dense prepared workloads and
  some full-pipeline runs. The API retains explicit fallback/overrides and avoids
  claiming that native execution is always the fastest choice.

## Scope and remaining work

Implemented: exact bounded invoice/ledger calculations, nine rounding rules,
fractional prices/rates, checked line bounds, exact aggregation, immutable prepared
batches, explicit backend selection, cooperative async/cancellation, native buffer
validation, independent Decimal comparisons, optional explicit native builds and
standalone package tooling.

Partial: currency tags are application-supplied, not an ISO registry or a language
Money type; ledger aggregation is not journal posting or a full bookkeeping system;
async calculations yield on the current thread without a worker pool. Native
building currently targets macOS/Linux arm64/x64 with a 128-bit-capable compiler.

Missing: typed IR, standalone native execution, backend performance comparison,
Windows native kernel, Decimal128 language types, FX metadata, complete accounting
domain packages, C ABI, official native Python bindings, WebAssembly and an Arya
registry. Existing Node/MySQL/Python/UI functionality is retained, not reclassified
as native functionality.

Unverified: production financial fitness, new-revision remote platform matrix,
external learner sessions, adversarial security audit and stable maintenance
commitments. See the [gap analysis](architecture-audit.md) and
[roadmap acceptance gates](implementation-roadmap.md).

No external project was changed, and no package, service or marketplace release
was published. The learner review kit is prepared; participant recruitment and
actual sessions remain with the owner.

## Recommended next milestone

Introduce a verified typed IR from the shared frontend, then compare real minimal
LLVM/Cranelift/C-backed hello/calculator executables with identical semantics.
Require a binary that runs without Node/Python and explicit diagnostics for
unsupported operations. Currency-aware Money/ISO data and broader accounting
invariants remain separately specified library work. Do not restore the retired
native backend wholesale or expand into unverified production claims.
