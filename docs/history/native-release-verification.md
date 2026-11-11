# Verified native preview publication

> Historical native documentation. The Node.js-only 1.3 source line retires this compiler/profile. Use [runtime and migration](../node-runtime.md) for current development; the implementation described below remains in [the historical source](https://github.com/HamzaArya/arya-lang/tree/1d3d553826f6dc1f67c6a1f9a7a9f8955a23cfda). Results and commands below apply only to their older versions.


> Historical publication evidence for 1.1.0-alpha.1. Its hashes, native binaries, and platform results remain specific to that release. See [current qualification](../release-readiness.md) for the current source candidate.

Arya **1.1.0-alpha.1** was published on 9 November 2026 as an experimental native/self-hosting preview. It is not a stable 1.1 qualification.

- [GitHub prerelease and standalone compilers](https://github.com/HamzaArya/arya-lang/releases/tag/v1.1.0-alpha.1)
- [Published npm version](https://www.npmjs.com/package/arya-language/v/1.1.0-alpha.1), with next pointing to this version at verification
- Release source/tag: `0de97c43fdf9a5bb14c86d57e76ee4258d540143` / `v1.1.0-alpha.1`
- Reviewed npm archive SHA-256: `5f74d6b72135731e32e7e2d88a38b1b575e262e3c6038d009d72de29352a7792`
- Published npm SHA-512 integrity: `sha512-pUtuN7249KNfkiQrCubo+CIA6KYQqJMuNjyeUbI8uN5TRz/kkUuOcHz7dTZEVrloYoLbZcSxceXmZLj0QzCKuQ==`

The registry integrity was compared with the exact reviewed archive. All nine checksum-listed GitHub assets were downloaded after publication and their SHA-256 values verified. GitHub's release includes the tarball, VSIX, editor kit, macOS arm64 and Linux x64 standalone self-hosted compilers, source manifest, qualification evidence, CI results, and checksums.

## Qualification

[Native workflow 42571263242](https://github.com/HamzaArya/arya-lang/actions/runs/42571263242) passed on macOS with Clang and Ubuntu with GCC and Clang. Each job ran the language/native suite, a three-generation self-hosting bootstrap, conformance examples, native benchmarks, and compiler packaging. Generation 2/3 generated C matched exactly. Both published platform binaries derive from those successful CI artifacts.

[Language workflow 42571263224](https://github.com/HamzaArya/arya-lang/actions/runs/42571263224) passed the existing language/package matrix on Ubuntu, macOS, and Windows with Node 22.15.0 and 24. Native execution tests are excluded on Windows; these results do not claim a Windows native backend.

Local macOS arm64 validation passed 104 language/artifact tests, installed-package/API/CLI acceptance, editor packaging, and the public-prerelease release audit. The source-written compiler rebuilt itself without Node, compiled the calculator and conformance program, rejected a const write, and produced matching C across generations. The debug-mode conformance program also passed with forced collection.

A post-publication check using the exact native compiler allocated 30,000 cyclic record/list graphs in six batches of 5,000. After explicit collection, retained managed bytes were `[2646,2646,2646,2646,2646,2646]`. This verifies a bounded heap for that workload, not a universal memory/latency guarantee.

The retained numeric-loop benchmark reports a local native/C median ratio of approximately 0.89 with process startup included. All raw samples, input size, compiler identity, build time, binary size, and the 4× regression budget are recorded in the release qualification asset. This single workload does not establish general C/Rust performance; broader workload characterization remains open.

AryaCode's native integration is committed at `81cebc0`. Its 63 service tests and real embedded/portable desktop tests passed, including a native executable launched through normal desktop Build/Run. Product version 1.2.0 is independent of language version 1.1.0-alpha.1.

## Remaining boundaries

The native contract deliberately excludes GUI frameworks, npm/Python imports, async/threads, arbitrary C FFI, Windows native qualification, and interactive source debugging. The standalone compiler still needs a C11 toolchain/SDK to build programs; finished programs require neither Node nor a compiler. Stable 1.0/community qualification and broader performance characterization remain open. See the [native specification](arya-native-specification.md) and [plan](arya-1.1-native-plan.md).
