# Arya 2.0.0 platform qualification log

This records actual runner results, including failures. Pending or failed runs
do not qualify release artifacts. Local packaging fixtures establish script
behavior only; they are not evidence of Windows execution.

## Candidate `1f5902f`

- [Desktop workflow 43457213299](https://github.com/HamzaArya/arya-lang/actions/runs/43457213299): both macOS and Linux completed self-hosted SDK bootstrap. Both then failed the CSV sanitizer regression because empty array concatenation passed null pointers to a zero-byte copy. The array repair and focused empty-array regression are in the next candidate.
- The Windows job completed stage-one and stage-two compiler construction, then failed while stage two invoked the C compiler. Cygwin reported `fatal error in forked process` and `can't commit memory for stack`, followed by `Resource temporarily unavailable`. `process.run` was forking from an Arya asynchronous task stack. Its Cygwin implementation now uses `spawnvp(_P_NOWAIT)` and retains the existing `waitpid` exit-status contract; Unix keeps its existing process implementation. The new regression checks calls from a suspended task, argument quoting, Unicode, executable lookup, inherited environment, error handling and exit status.
- [Independent workflow 43457213406](https://github.com/HamzaArya/arya-lang/actions/runs/43457213406): macOS completed the fresh source build, installed SDK checks without Node/Python, and optional arithmetic, compiler, formatting, type/LSP, documentation and authentication reference gates. Linux failed the fresh gate; that script previously hid the redirected build log. The next candidate prints the failure tail and retains the complete log.

## Candidate `e24caa4`

- [Desktop workflow 43465804910](https://github.com/HamzaArya/arya-lang/actions/runs/43465804910): Windows failed its early toolkit action step before compiler bootstrap. GitHub's generated multiline step script used CRLF, so `make` received `CC=gcc\r`. Cygwin shell steps now enable `-o igncr`, as documented by the [Cygwin installation action](https://github.com/cygwin/cygwin-install-action#line-endings). This was a workflow line-ending failure, not a Win32 widget execution result. Other platforms were pending at this log entry.
- [Independent workflow 43465805025](https://github.com/HamzaArya/arya-lang/actions/runs/43465805025): pending at this log entry.
- Windows now probes the real GCC sanitizer capability and stores its output. If Cygwin lacks ASan/UBSan, its focused tests explicitly use release/debug builds plus GC stress. That result does not claim Windows sanitizer coverage.
- Windows gates include core behavior, empty arrays, collection mutation, process spawning, UInt32 operations, byte hashing, API contracts and byte/atomic-file behavior, editor paths, real Win32 controls, native Windows editor transport, SDK archive integrity, relocation and installation.
- The optional Python bridge remains unqualified on Windows/Cygwin; its separate subprocess implementation still uses `fork`. It is not required by native compiler, CLI or GUI applications.

## Local packaging checks

`python3 native/tests/distribution-packaging.py` passed 18 fixture commands for
checksum verification, managed installers, immutable archive outputs and
platform-specific SDK/VSIX handling. Actual Windows package and installer
qualification requires the Windows runner gates above.
