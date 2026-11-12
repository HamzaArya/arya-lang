# Native independence migration report

The independent 2.0 native compiler and core runtime are implemented. The full
conversion of every library/tool is **not complete**; [the port manifest](../native/manifest.json)
records the gaps. The [native guide](native-independence.md) defines supported use.

The compiler and SDK are built from C/Arya source without Node or Python. Native
programs use native managed values and system libraries. Exact decimal operations
use vendored libmpdec; binary64 text conversion uses Ryu. The native compiler
compiles itself through three generations and checks generated-C convergence.

## Verified milestone

The qualification on 12 November 2026 passed on macOS ARM64 with Apple Clang 21.
The [qualification record](../artifacts/QUALIFICATION-2.0.0-alpha.1.json) records the
exact source snapshot, results and artifact identities. It explicitly records
`allLegacyFunctionsPorted: false` and `stableReleaseReady: false`.

| Check | Result |
| --- | --- |
| Native compiler bootstrap | Three compiler generations; stage-two and stage-three generated C are byte-identical |
| Native acceptance suite | All 14 groups passed, including core/decimal/list/JSON outputs, live modules, diagnostics, output collision protection, cleanup and typed calls |
| Runtime safety | Collector-stress runs and ASan/UBSan passed; macOS leak detection was not run |
| Fresh source build | Build, tests and SDK packaging passed with Node, npm and Python absent from the executable search path |
| Installed SDK | Relocated compiler built a decimal application using the host C toolchain; application ran with an empty tool search path and matched expected output |
| Independent decimal reference | All 600 seeded cases matched Python's independent pure-Python decimal implementation; Python was used only as a test oracle |
| Financial process integration | Native JSON-lines calculation example produced exact expected invoice totals |
| Retained 1.3 compatibility | `npm run check` passed with 383 tests passing, 4 skipped and no failures; four existing compiler/runtime bundles remained byte-identical |
| Retained releases | All 20 recorded artifact checks from alpha.9 through alpha.12 remained unchanged |

The native source manifest covers 183 compiler/runtime, bootstrap, dependency,
test and example files plus their build inputs. Narrative documentation and the
retained Node implementation are outside that native source snapshot. Evidence
logs are retained locally in `.build/evidence/native-independence/`.

## Delivered SDK

The unpublished local archive is
[`arya-native-2.0.0-alpha.1-darwin-arm64.tar.gz`](../artifacts/arya-native-2.0.0-alpha.1-darwin-arm64.tar.gz):
572,094 bytes, SHA-256
`ce0e2ad5d9bd2b75f09e6e9ac293a6f2fcc6874f78ec674e9a0d9a892390ea7c`.
It contains the native executable, decimal headers/static library, examples,
manifest, provenance, documentation and licenses. It contains no JavaScript,
TypeScript, npm package manifest or `node_modules`.

The compiler executable is 1,449,672 bytes and links only the macOS system library.
An installed compiler still needs a host C11 toolchain to build applications.
The generated applications do not need that toolchain to run. The artifact
checksums are in [the checksum file](../artifacts/SHA256SUMS-2.0.0-alpha.1).
Linux CI is prepared but has not been executed for this revision; Windows and
cross-target qualification remain open.

## Failures found and corrected

- Two development bootstrap builds overlapped; both were stopped and verification
  was restarted serially.
- Historical string joining repeatedly copied growing buffers. A single-allocation
  implementation and raw runtime-source embedding remove that bootstrap bottleneck.
- A newer compiler could call native primitives absent from the historical seed's
  emitted runtime. The bootstrap now upgrades the generated stage-one runtime
  explicitly before running it; subsequent generations converge from that point.
- Earlier output-failure cleanup missed a notices sidecar and staged partial output.
  The corrected path removes only its newly created outputs and staging files.

## Remaining migration

Async/finally semantics, composite checking, dates/time zones, networking, database
connectors, validation/logging, cryptography, testing/UI libraries, native editor and
package tools, general FFI and broader platform qualification remain open. These
are explicit unported functions, not successful conversions or silent fallbacks.
The existing 1.3 implementation and all reviewed archives remain intact for current
consumers. Arya Ledger and its data are untouched.

This is an opt-in major-version migration. The native compiler rejects unsupported
imports, async constructs and composite type annotations explicitly. Existing 1.3
projects using these features need their replacements before changing compilers.
There is no implicit fallback to Node.

No execution-throughput or memory benchmark comparison was completed for this
new independent backend. The earlier scalar LLVM preview measurements describe
a different compiler path and do not establish this backend's performance.

The next milestone should port async/finally semantics and expand differential
language tests, then replace the remaining filesystem/JSON APIs and enterprise
libraries. The Node compatibility implementation can be retired after required
application and editor replacements pass their migration gates. Each subsequent
milestone needs a fresh source qualification and a new immutable artifact version.
