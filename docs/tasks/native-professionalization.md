# Native Arya engineering status

The native compiler/runtime migration is implemented. Arya remains an alpha language with qualification scoped to particular source snapshots and platforms; completing the migration is not a claim of stable production support. Use the [native profile](../native-profile.md) for supported behavior and [installation guide](../installing.md) for platform instructions.

## Implemented work

| Area | Implemented behavior and evidence |
| --- | --- |
| Independent toolchain | Self-hosted compiler, C11 backend, native language services and an SDK that builds/runs without Node; [bootstrap](../native-independence.md) and [migration qualification](../native-independence-report.md) |
| Exact financial libraries | Parsed decimals, Money, prepared accounting batches, balanced journals, trial balances and classified statements; [accounting API](../accounting-engine.md) and [data policies](../native-finance-data.md) |
| Security and diagnostics | Audited cryptographic dependency, bounded validation/inspection, structured errors/logging and disabled-trace guards; [security and debugging](../native-security-debugging.md) |
| Filesystem concurrency | Bounded native workers for asynchronous text read/write, existence and directory operations; managed values remain on the runtime thread; [current execution profile](../native-profile.md) |
| Measured optimization | Guarded call/data paths, exact fixed formatting, string storage, JSON scanning and Ledger conversion improvements; [runtime](../native-fastpaths.md) and [Ledger](../native-ledger-fastpaths.md) reports include unchanged/slower cases |
| Reliability and packaging | Sanitizer/collector checks, seeded malformed-source tests, independent numeric references, immutable archive creation, checksums and AppleDouble exclusion; [engineering audit](../native-professionalization.md) and [contributor checks](../../CONTRIBUTING.md) |
| Learner preparation | Exercises, scoring and moderator instructions are prepared in the [learner kit](../native-learner-review.md); no completed sessions or external acceptance results are claimed |

## Remaining acceptance criteria

1. **Platform qualification:** run the complete source bootstrap, runtime, sanitizer, SDK and integration gates on Linux and additional CPUs; implement and qualify a Windows host layer before advertising native Windows support. Cross-compilation and Wasm need separate designs and tests.
2. **Broader robustness:** extend parser coverage to runtime and language-service fuzzing, retain minimized failures, and strengthen financial conservation, currency, serialization and cancellation properties.
3. **Release operations:** establish a signed, independently verifiable distribution channel and documented reproducibility expectations. Do not infer a published release from a local candidate archive or the shared prerelease version string.
4. **Developer interfaces:** design a stable embedding ABI and native debugging interface with explicit ownership, error, thread and version rules before treating them as supported APIs.
5. **Performance:** profile remaining dynamic-object, collection, small-call and host-service costs using representative inputs; preserve exact policies and report regressions rather than assuming native code wins universally.
6. **Usability:** recruit and observe real learners using the prepared kit. Record task completion, time, help, diagnostics and financial correctness; fix repeated blockers and rerun affected tasks. Planning five participants does not mean five sessions have occurred.

Each item needs an implementation and recorded acceptance evidence. Optional Python bridges, live MySQL, desktop rendering and editor-host integrations have separate gates. Historical plans for the retired Node implementation remain in [compat/node/docs](../../compat/node/docs/README.md); they do not define the current native API.
