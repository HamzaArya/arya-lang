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

## Preserving Windows bootstrap work

A successful fresh Windows bootstrap is now captured before later gates as
`windows-bootstrap-sdk-unqualified`. This internal artifact contains the SDK,
both generated-C stages and origin metadata. Its name and metadata explicitly
do not claim a passing Windows release. The empty-PATH GCC compile/link/execute
probe runs before bootstrap, so a loader or toolchain isolation failure is
reported without first spending another complete bootstrap.

A manual desktop workflow with `target=windows` may supply the original run ID,
exact source SHA and immutable artifact ID using `windows_bootstrap_run`,
`windows_bootstrap_sha` and `windows_bootstrap_artifact`. Reuse requires a
successful original bootstrap and completed capture, the GitHub artifact digest, complete SDK
checksums, both generated-C identities, matching Cygwin/GCC versions and equal
native build inputs in the new checkout. Tests, documentation and packaging
metadata may change and are recorded separately. Every current Windows gate
still runs before the ordinary release SDK artifact can be produced.

## Candidate `2477705` independent result and `4ddf3a5` retry

[Independent workflow 43474217260](https://github.com/HamzaArya/arya-lang/actions/runs/43474217260)
passed every Linux and macOS fresh-build, full native core, installed SDK and
reference gate. Linux desktop qualification separately reached API/HTTP tests;
it stopped when an assertion rejected ASan's known `makecontext`/`swapcontext`
warning even though the HTTP server exited zero. The next controller permits
only the exact sanitizer warning in sanitized mode, prints it, and rejects any
other stderr; it does not suppress runtime sanitizer errors.

[Windows retry 43478802288](https://github.com/HamzaArya/arya-lang/actions/runs/43478802288)
passed the early empty-PATH C compiler/linker/PE execution probe and the direct
Win32 action harness before entering full bootstrap. This is measured evidence
for the loader-isolation fix, not yet a complete Windows qualification result.

[Linux desktop retry 43478801468](https://github.com/HamzaArya/arya-lang/actions/runs/43478801468)
passed every gate on Ubuntu 24.04 x64: self-hosted bootstrap, full core suite,
17 typed API checks and independent byte oracle, all 12 HTTP relocation cases,
actual GTK controls/actions under Xvfb, SDK distribution and packaging. The
SDK artifact is `14064643844`, whose ZIP SHA-256 is
`cb946e824b24c079fb4ce985875c904d571476aeb684302efd4b7adb876b24a4`.
The newer `25f1915` Linux run adds a real versioned installer/create/build/run
gate; that extra gate was pending at this entry.

## Candidate `25f1915` Linux installation result

[Desktop workflow 43480059478](https://github.com/HamzaArya/arya-lang/actions/runs/43480059478)
passed every Linux gate, including actual versioned SDK installation in a path
containing spaces and installed-compiler project creation, checking, compilation
and execution. SDK artifact `14067305675` has ZIP SHA-256
`5a819b1870184d750c7c6a418cbb151f0a110f20f09174735ae999acecb8d77b`.
The SDK tar archive SHA-256 is
`2cfe1195fc1a94a043a4ddbf1292d4616227978f0743b6b3de410c46ff98853c`;
its actual ELF x86-64 compiler SHA-256 is
`06d518dda4d8aacaea4d8b131b39ee5d89317b863478413d4235ee379cfd9694`.
All 563 SDK checksums passed after download, stage-two/stage-three generated C
converged, and all 260 selected native build inputs matched the later `9aa0575`
checkout. Three differences were confined to packaging/test-controller files.
This qualifies the measured Ubuntu 24.04 x64 target; it does not establish a
minimum Linux kernel, glibc or GTK version for every distribution.

[Independent workflow 43479940689](https://github.com/HamzaArya/arya-lang/actions/runs/43479940689)
also completed successfully on both Linux and macOS. It rebuilt from a fresh
source snapshot with Node/Python absent from executable search paths, ran the
full native and profile gates, and exercised the actual managed installer with
an explicit prefix while HOME was unset. All subsequent reference gates passed.

## Windows bootstrap capture checksum failure

The Windows job in [run 43478802288](https://github.com/HamzaArya/arya-lang/actions/runs/43478802288)
completed bootstrap, then its new SDK preservation helper rejected a checksum
row. Cygwin's `shasum` defaults to the standard binary marker (`*`); the helper
and installer had accepted only the text marker (a space). The failed helper
did not preserve its SDK archive, and the later runtime gates were skipped.
The run's logs remain available as evidence artifact `14067398172`.

The corrected parser and installer accept both standard markers without
relaxing path, inventory or digest validation. New inventories and archive
sidecars explicitly use binary mode, avoiding CRLF conversion when verifying
PE executables or gzip archives. An early actual Cygwin fixture now tests
CRLF/NUL/high-byte data, a compiled PE fixture and the installer route before
bootstrap. Preservation writes its raw archive before optional verification;
verification failure is retained in evidence and no longer skips independent
runtime gates. Reuse still validates every recorded byte and native input
before accepting those raw bootstrap bytes. These fixes require a new Windows
run; they do not retroactively qualify the skipped gates.

## Current Linux installer with binary checksums

[Installer recheck 43489334671](https://github.com/HamzaArya/arya-lang/actions/runs/43489334671)
passed on Ubuntu 24.04.5 x64 at `e6ffbdb`. It verified the immutable Linux
`25f1915` SDK artifact and all 260 native build inputs, preserved the qualified
compiler/library bytes, refreshed the installer and metadata, and checked the
binary-mode checksum inventory. The actual managed installer succeeded with
HOME unset and paths containing spaces and an apostrophe. The installed compiler
created, checked and compiled a CLI project; execution returned `59.85` for
`19.95 × 3` and `27021597764222979.03` for `9007199254740993.01 × 3`.

The tested current installer SHA-256 is
`1ae1e0fa3f093e9216ce4f4c24cfc43705186fabf3910957938365fd1f94e2df`.
Evidence artifact `14069546003` has verified ZIP SHA-256
`96e85860cda319f9de211139d968a49d2d5a191ec86f3d706fb986a3faac4f6e`;
the compact identity and result record is [linux-installer-recheck.json](linux-installer-recheck.json).
This requalifies the changed installer and checksum format. The compiler/runtime
and GTK qualification remains the separately recorded original Linux job.

## Final Unix fresh-source qualification

[Independent workflow 43488637857](https://github.com/HamzaArya/arya-lang/actions/runs/43488637857)
completed successfully on both macOS (job `132103630616`) and Linux (job
`132103631325`) at exact source `c87190bd266b009e6fb7d2492cd06034fdb79755`.
Each platform passed the fresh-source native bootstrap, core/profile tests and
managed installer with Node/Python absent from executable search paths. This
also exercises the final binary-mode source/SDK checksum format. All subsequent
arithmetic, compiler robustness, binary64, types/LSP, documentation and native
authentication HTTP reference gates passed.

[final-unix-independent.json](final-unix-independent.json) records the exact job
identities, results and hashes of the retained complete official logs. The
shipping SDK origins remain the separately identified macOS `0dc38b7` and Linux
`25f1915` desktop jobs; this later fresh-source proof does not change those
binary provenance records.

## Windows crypto link dependency

[Windows run 43488694656](https://github.com/HamzaArya/arya-lang/actions/runs/43488694656)
at `c87190b` passed bootstrap, binary checksum/installer checks and validated
bootstrap capture. Eleven of twelve collected runtime gates passed, including
the full core fixture gate, arrays/collections, process execution, explicit
Python platform rejection, UInt32, exact decimal remainder, editor paths,
all eight public Win32 widgets and real actions, byte/atomic APIs and all HTTP
relocation scenarios. The security-bytes application failed during ordinary
`arya build`: OpenSSL's native certificate store referenced Windows functions
from Crypt32, but the compiler did not link that library. Editor-host and
packaged SDK checks were skipped after the failure.

The vendored OpenSSL 3.5.9 `Configurations/10-main.conf` Cygwin-common target
explicitly requires `-lcrypt32`. The corrected compiler adds that dependency
for Cygwin crypto applications. The retry also runs established security and
diagnostic behavior checks and a crypto program through the relocated SDK.
Runtime, editor and distribution checks now collect independent outcomes, with
a mandatory final gate requiring every outcome to pass before a qualified SDK
can be uploaded. No assertion or native source-identity check is relaxed.

[windows-crypto-link-failure.json](windows-crypto-link-failure.json) preserves
the exact passed/failed gates, unavailable sanitizer/file-size-limit coverage,
immutable artifacts and log checksum. This compiler-input change requires
fresh platform qualification; the preserved older bootstrap cannot be reused
as unchanged source.
