# Native syntax and documentation update

Version `2.0.0-alpha.3` adds record shorthand, string computed keys and record-only shallow spread to the standalone compiler. It is a local, unpublished alpha candidate. Older alpha.2 SDK archives do not contain these changes. The [language reference](arya-language.md) is the current syntax manual; [installation](installing.md) explains how to move the matching compiler or source snapshot to another computer.

## Language changes

```arya
const currency = "AFN"
const defaults = {currency, scale: 0}
const key = "rounding"
const options = {...defaults, [key]: "half-even", scale: 2}
print(JSON.stringify(options))
```

The new forms compose existing records without introducing classes or another object model. Explicit fields remain valid. Evaluation is left to right; later fields replace earlier values. Computed keys must be strings and are checked before their value expression runs. Spread accepts records only and copies values shallowly, including shared nested references. It snapshots stored keys, then reads each current value once; getter additions are excluded and getter failures stop the operation. See the [record contracts](arya-language.md#records-and-composition) for ordering, getter, Promise and typing details.

The parser, native emitter, type inference, formatter and language server understand the added forms. Rename preserves shorthand field names by expanding `{name}` to `{name: renamed}` when its binding is renamed. Known spreads and literal computed keys retain structural inference; a dynamic computed key or `any`/union spread conservatively makes the literal `any`. Record spread does not make nested shared mutable values fresh or covariant.

### Stricter diagnostics

Review found that a record/function member read can invoke a getter that changes a mutable variable captured by a closure. Keeping the earlier null/undefined narrowing after that read can incorrectly accept a `number` that is now `null`. The checker invalidates affected refinements, with regression coverage for expression order and restored control-flow states.

Some previously accepted programs therefore need a new check after the effect, or a `const` snapshot of the narrowed value before it. Ordinary uncaptured locals retain their narrowing. Structural record types do not describe getter purity, so this is deliberately conservative even for a record containing only data fields. Canonical syntax has not been renamed. Retired aliases were removed before alpha.3; their migration is described in the [language reference](arya-language.md#familiarities-and-differences-from-javascript).

## Documentation and distribution changes

The current manual now has one installation guide, a practical language reference, CLI and SDK guides, a catalog of all 26 public standard-library modules, and links to accounting, security, debugging and performance evidence. The library catalog is checked against the native manifest.

The cleanup removed 42 redundant Node-profile guides/scripts and two obsolete status mirrors from the active documentation. Original Node documents remain in `compat/node`; exact status mirrors are retained in the maintenance records. Historical plans, releases and benchmark evidence remain available, with corrected links and explicit version scope. The [cleanup record](maintenance/cleanup-2026-11-13.json) lists preserved paths and hashes.

`native/DOCUMENTATION` defines which current guides, examples and evidence accompany source verification and SDK assembly. Installed links are rewritten to the installed layout; references to material available only in the full checkout are labeled as such. The standalone SDK excludes JavaScript editor adapters. A separate native source archive includes pinned vendor sources and optional test controllers, so unpublished changes can be built on another computer without relying on an older Git revision.

## Verification

The delivered compiler comes from the isolated fresh source tree. Its native bootstrap, full runtime and profile suites passed with Node/Python/JavaScript engines excluded from PATH. Its first distribution check expected an obsolete README heading. After that test-only correction, the distribution, package, relocation, integrity and dependency checks passed by running the remaining gate steps. The original combined command exited nonzero; the [gate record](verification/2.0.0-alpha.3/gates.json) preserves that result and the successful resumption explicitly.

Concurrent development changed the shared accounting implementation, compiler build and library catalog during verification. Although the separate shared `make check` command exited zero, it does not identify a fixed source snapshot and is excluded from qualification. Those edits remain intact. The archives contain the isolated code identified below and its 26-module manual; they do not include the concurrent accounting optimizations or new unqualified module additions. Qualification applies to these archives, not every file currently present in the shared checkout.

| Check | Result |
| --- | --- |
| Native bootstrap | Stage-two/stage-three generated C identical in each build |
| Source identity | 386 frozen build/test inputs match the fresh source tree |
| Full isolated suites | `native-test`, `native-profile-test` and corrected `native-distribution-test` passed |
| New record behavior | 100 assertions in each of three modes; 41 rejection cases; positive flow cases |
| Memory and effects | GC stress, ASan/UBSan and two suspended-getter probes passed; leak detection not run |
| Optional references | 105 type cases, language-server checks and 267 parser robustness cases passed |
| Manual examples | 67 command checks passed, including all 12 language-reference snippets |
| Packaging | Nested checksum manifests are covered; final archive inventory validation is recorded beside the archives |

The [qualification record](../native/qualification/2.0.0-alpha.3.json) records the delivered compiler identity, beginning `d81770ed`. The [source manifest](../native/qualification/SOURCE-MANIFEST-2.0.0-alpha.3.json) identifies its 386 verified code, build and test inputs. Generated C embeds absolute source-frame paths. Before the concurrent edits, replacing only that root text made the shared/fresh generated C files identical; this is not a claim of path-independent binary reproducibility or qualification of the later shared compiler.

[Example results](verification/2.0.0-alpha.3/examples.json), [parser results](verification/2.0.0-alpha.3/parser-fuzz.json), [independent control-flow review](verification/2.0.0-alpha.3/control-flow-review.json), [source-packager checks](verification/2.0.0-alpha.3/source-packager.json) and compressed logs accompany the manual. The example, type, parser and language-server checks were rerun against the exact isolated delivery compiler. Earlier parallel attempts exhausted local disk space, and one shared Clang process aborted with a mutex error whose exact cause is unestablished. Those logs are retained; the unchanged sanitizer probe and full native suites passed in the isolated tree.

The independent final archive audit found that checksum generation excluded every file named `SHA256SUMS`, omitting a nested historical evidence manifest. The earlier preflight repeated that basename filter, so its completeness claim was too broad. The [corrected preflight assessment](verification/2.0.0-alpha.3/source-packager.json) retains the original result and identifies the gap. Both packagers now exclude only their root `./SHA256SUMS`; the distribution test compares the complete regular-file inventory against listed paths. The corrected packaging scripts and distribution check passed without changes to the compiler/runtime/library code. Initial archives are retained with a failed-validation notice.

The matching binary SDK and complete native source archive are delivered under `artifacts/native-syntax-2026-11-13/verified/`, with archive checksums and an external `delivery.json` describing final transfer validation. Documentation and qualification records are assembled after code verification and receive their own package checksums. The packages are local artifacts, not a published GitHub or package-registry release. Follow the [installation guide](installing.md) on the destination computer.

## Limits and follow-up work

Only macOS ARM64 is qualified locally, on macOS 26.5.2. The delivered compiler declares macOS 26.0 as its minimum load version; other OS releases have not been separately qualified. Intel Mac, Linux and WSL source instructions are experimental until their own full builds and tests pass; native Windows/MSVC is not supported by this delivery. The compiler targets native executables through C11 and requires a C toolchain to build applications. Python and MySQL remain explicit optional integrations. The macOS asynchronous runtime still uses deprecated `ucontext` interfaces, and real desktop UI, MySQL and other-platform integration tests are outside this update.

These changes do not establish production readiness or a new speed advantage. The retained [Ledger benchmark results](native-ledger-fastpaths.md) describe their recorded alpha.2 compiler and worker hashes; they were not remeasured for alpha.3. Native record spread performs allocations and field reads, and is not a replacement for workload profiling. Destructuring, user-defined generics, classes and complete JavaScript semantics remain unsupported. Future language additions should retain explicit semantics, meaningful tests and editor support.
