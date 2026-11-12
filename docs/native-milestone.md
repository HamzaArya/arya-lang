> Historical implementation guide. The original is preserved in [compat/node/docs/native-milestone.md](../compat/node/docs/native-milestone.md). Current native behavior is defined by the [native profile](native-profile.md), [SDK guide](native-sdk.md) and [qualification report](native-independence-report.md).

# Native compiler milestone — alpha.12

This milestone implements the first typed IR and standalone native executable
subset under the [master plan](arya-master-plan.md). The
[native preview guide](native-preview.md) defines the exact supported boundary.

## Implemented

The existing parser/resolver/type checker now feeds a separate scalar lowering,
versioned structured typed IR, independent verifier, deterministic IR inspection,
LLVM emitter and explicit Clang host build driver. The executable uses a small
C++ output runtime and system libraries. It requires neither Node nor Python at
execution. Current compiler execution still requires Node.

The additive command/API preserves existing Node workflows. Binary64 values are
not silently converted into integers or exact money. Unsupported constructs carry
source diagnostics. Output publication is exclusive and atomic; failed builds
cannot replace an existing executable.

## Qualification

Local platform: macOS ARM64 / Apple M1, Node 24.16.0 and Apple Clang 21.

- Full `npm run check` with native SDK tests enabled: **387 tests, 383 passed,
  zero failed, four optional browser/Electron/live-MySQL skips**; docs, formatting,
  TypeScript and builds passed.
- Focused native API/CLI suite: **16 passed on each of Node 22.15.0, 24.16.0 and 26.13.0**, with zero skips. Eight additional pure IR verifier
  regression groups pass in the full suite.
- Differential cases cover debug/release, typed functions, recursion/loops,
  short circuit, argument side effects, Unicode/NUL strings, 80 seeded arithmetic
  expressions and 256 finite binary64 constants through the complete frontend.
- Independent backend checks compare 10,000 random binary64 values with Node
  formatting, plus 1,000 finite literals emitted as LLVM and executed with
  ASan/UBSan. No mismatches or sanitizer failures. macOS leak detection was not run.
  Their component identities are retained in the backend evidence record.
- Relocation tests remove source, inspect native file headers/dependencies and
  execute with an empty executable search path. Ordinary local binaries link
  only system C++/C libraries; they load no Node/Python library or subprocess.
- Existing-output refusal, validation before toolchain invocation, and a compiler
  that writes a partial staged output then fails all preserve final output safety.

Fresh source/package and runtime-specific evidence is retained under
`.build/evidence/alpha12-native/` and
`artifacts/QUALIFICATION-1.3.0-alpha.12.json`. Only completed commands in those
records count as platform evidence. CI configuration exists for Linux/macOS;
remote jobs have not been executed for this candidate.

## Measurements

[Raw samples and source hashes](benchmarks/1.3.0-alpha.12-native.json) record nine
alternating process launches after one warmup, running the same one-million-step
scalar loop and printing the identical value `124999875000`.

| Measurement | JavaScript backend | Native release preview |
| --- | ---: | ---: |
| Process startup plus calculation, median | 43.71 ms | 3.40 ms |
| Compilation observed | 8.91 ms | 1,326.51 ms including Clang/linking |
| Output file size | 1,636 bytes, requires Node | 34,456 bytes, requires system C/C++ libraries |

The native process completed startup plus calculation about **12.9× faster in this workload**. This
includes startup, not just loop execution; it is not a general language-speed,
financial-arithmetic or memory claim. The development host was not dedicated
benchmark hardware (load and free-memory observations are retained). Compilation
gets more expensive, while deployment can omit Node for the supported subset.
Run `npm run benchmark:native-preview` to reproduce the protocol.

## Issues found and fixed

Independent review found malformed IR values that could hide data from
serialization or invoke custom iteration. The verifier now rejects accessors,
symbol/custom-iterator arrays, sparse arrays, array subclasses, non-enumerable
fields, false-like malformed return values, nonfinite metadata and excessive
text/structures. Scope, immutability, call signatures and return paths are checked
before backend emission. Tests preserve these rejection cases.

The native preview rejects multiargument `print` when its first string contains
`%`, because the existing Node output contract applies console-formatting rules.
General formatting is outside this subset. Numeric formatting explicitly
preserves negative zero and uses differential reference checks.

## Next milestone

Expand the verified IR/runtime deliberately: native source debug locations and
runtime diagnostics, module/linking contracts, explicit integer/decimal/Money
representations, then managed values and FFI ownership. Evaluate an alternative
backend on the same IR before selecting a production backend. Broader language
coverage must keep unsupported cases explicit until independently tested.

## Incomplete work

Full language modules/imports, records/arrays/closures, GC, general strings, exact
native money/decimal types, native FFI/host bridges, source-level native debugging,
standalone compiler distribution, Windows/cross-compilation/Wasm and broad platform
qualification remain open. LLVM is an experimental first backend; production
selection still requires measured alternative-backend evaluation.

No breaking syntax change, public publication or external-project change is part
of this milestone. Financial domain libraries and learner sessions remain separate
roadmap items.
