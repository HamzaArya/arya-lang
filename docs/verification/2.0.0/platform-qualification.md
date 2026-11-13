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

## Candidate `1ab2e35`

[Desktop workflow 43466397607](https://github.com/HamzaArya/arya-lang/actions/runs/43466397607)
confirmed that the CRLF correction allowed the Win32 backend and native action
probe to compile. The probe then failed an event assertion before bootstrap;
its original assertion did not identify the missing event. Review found that
the multiline text probe used `WM_SETTEXT`, which [does not send `EN_CHANGE`
for multiline Win32 controls](https://learn.microsoft.com/en-us/windows/win32/controls/en-change).
The next probe uses an edit replacement message, activates the button's window
before a synthetic click, and prints the event identity on success or failure.
These are test-driver changes; the runtime and Win32 backend are unchanged.
This entry does not claim that the revised probe passed.

## Candidate `96e4b60`

[Desktop workflow 43466983858](https://github.com/HamzaArya/arya-lang/actions/runs/43466983858)
passed the revised direct Win32 toolkit action step on an actual Windows runner.
Its checks include button events, duplicate selection labels, text changes,
input submission, multiline editing, window close events and retained closed
window lifetime. The subsequent native compiler bootstrap and full public GUI,
SDK and editor gates were still running or pending at this entry. This toolkit
step alone does not qualify the complete Windows distribution.

The macOS job completed all desktop workflow gates and produced its SDK. An
inspection of that candidate's actual binary identified Mach-O ARM64, minimum
macOS 15.0 and SDK 15.5; `--version` also ran successfully on the local macOS 26
ARM64 host. This older artifact is retained only for inspection, not publication.

The Linux job passed core tests through numeric, fixed-number and descriptor
regressions, then failed `string-storage.arya:80`: its temporary-directory test
passed a plain prefix to `fs.tempDirectory`. The API's template requires a final
`XXXXXX`, which all production call sites already used. Linux rejected the
invalid fixture with `EINVAL`; the fixture now supplies the portable template.
No runtime change was needed for that failure.

## Candidate `9831cf3`

[Desktop workflow 43467923810](https://github.com/HamzaArya/arya-lang/actions/runs/43467923810)
completed Linux and macOS bootstrap and the empty-array and collection mutation
regressions. Both then correctly rejected the new decimal-remainder test's
nullable vector indexing at line 17. The test now validates vector shape and
binds explicit string operands before invoking the typed API. This failure
occurred before executing remainder vectors; it was not an arithmetic result.

## Candidate `0dc38b7` and Windows isolation follow-up

[Desktop workflow 43470021848](https://github.com/HamzaArya/arya-lang/actions/runs/43470021848)
completed every macOS gate, including the repaired collection and empty-array
cases, 869 remainder checks per mode, API contracts, HTTP relocation, AppKit
controls and SDK distribution. Its SDK artifact `14061468049` contains a
Mach-O ARM64 compiler targeting macOS 15.0. All 561 SDK checksums passed after
download, and stage-two/stage-three generated C converged. The archive SHA-256
is `04f8a197effdcde731bfb11447736c0cf779255f35a1d356c1066841dff2a6b5`.
[Independent workflow 43470021846](https://github.com/HamzaArya/arya-lang/actions/runs/43470021846)
also passed all macOS fresh-build, installed-SDK and reference gates. Both Linux
jobs reached the same invalid string-storage temporary-directory fixture noted
above; candidate `2477705` corrects that fixture and is being qualified separately.

The completed Windows job from candidate `96e4b60` passed its full SDK bootstrap,
confirming that subprocess spawning now reaches the final compiler and native
dependencies. Its next core test failed while loading `core.exe`: the test set
`PATH=/nonexistent`, which removed the declared Cygwin DLL search path. The
corrected isolation harness uses an empty POSIX PATH on Cygwin: its
[environment implementation](https://github.com/cygwin/cygwin/blob/master/winsup/cygwin/environ.cc)
provides the original DLL directory separately to the Windows loader when PATH
is absent or empty. The test uses an absolute C compiler path for compilation;
Unix runtime isolation continues to use the nonexistent PATH. This avoids
relocating the Cygwin DLL and still requires a passing Windows rerun.

That Windows runner's GCC linker explicitly reported missing `-lasan` and
`-lubsan`; release/debug builds with GC stress are therefore the Windows gate,
while sanitizer coverage remains qualified on macOS/Linux. The API controller
also probes Cygwin file-size limit support before attempting its write-failure
injection: Cygwin's [resource implementation](https://github.com/cygwin/cygwin/blob/master/winsup/cygwin/resource.cc)
does not implement setting `RLIMIT_FSIZE`. An actual `EINVAL` is recorded as
unavailable fault injection, not a passing injection result. Byte fidelity,
atomic replacement, target rejection and preservation tests remain enabled.
Windows independent gates now all run and retain their individual logs before
returning a failing status if any gate fails.
