# Direct native GUI implementation report

## Work performed

Added a separate `std gui` compiler feature, public static contracts, C runtime
bridge, platform ABI and bounded event queue. Native implementations use AppKit,
GTK 3 and Unicode Win32 controls. Cygwin is detected in the Windows build path.
The native SDK includes a platform-specific static library and linker flags;
applications link the GUI only when importing this module.

Added eight widget types, validated state reads/updates, native asynchronous
events, close/disposal handling and the persistent Task Desk example. Existing
`std desktop` continues to mean the older AppKit/WebKit host. Previous native
worker applications and their reports have not been repurposed as evidence for
this new direct language API.

## Actual friction and fixes

- The initial AppKit source exposed its queue through a private synthesized
  property; C functions could not access that ivar. `clang -fsyntax-only`
  reported two private-ivar errors. The queue now has an explicit public ivar
  inside the private implementation class; the public Arya API remains opaque.
- The first integrated Arya gate built but failed at import: the new export
  branch was nested under the legacy desktop feature guard. It now uses its
  own `ARYA_GUI` guard. The original failure is retained in
  `.build/gui/acceptance.log`; the final gate uses a separate log.
- The Task Desk checker inferred a growing unannotated labels array as
  `never[]`; explicit `string[]`/`number[]` annotations clarify the native
  list boundary. Negative checker probes include an annotation to enable
  Arya's opt-in type checking.
- Source review found closed windows retained their live-window allowance until
  garbage collection. Each backend now releases that allowance when the OS
  window actually closes; disposal does not decrement it twice. The native
  action harness includes 20 successive close cycles with handles retained.
- Native popup construction uses explicit `NSMenuItem` objects so duplicate
  labels remain separate choices. This prevents the duplicate-title collapse
  already reproduced in the earlier worker-host project.
- The core runtime still depends on POSIX `ucontext`, `poll` and related
  facilities supplied by Cygwin on Windows. Cygwin `process.run` uses direct
  spawning after `fork` from a cooperative task stack failed on a real runner.
  The optional Python bridge reports an explicit unsupported-platform error
  before starting a process on Cygwin. This is not a MinGW/MSVC runtime port.

## Verification and outstanding limits

Local host: macOS arm64. `clang -fobjc-arc -Wall -Wextra -fsyntax-only
native/gui/appkit.m` passed after the ivar fix. The native AppKit action harness
passed button actions, duplicate selection labels/indices, input change and
Enter submission, multiline change/dimensions, close and resource disposal.

Integrated compiler/bootstrap and full Arya widget-gate results are recorded
below when complete. GTK and Win32 sources have not been compiled or executed
on this macOS host; Windows/Linux qualification must come from their own
runners. No substitute backend or fake successful platform result is used.

The API intentionally stops at eight direct controls and explicit geometry.
Unimplemented advanced widgets and native application packaging are documented
in the API guide; no task was abandoned or silently redirected to a webview.

## Local integrated result

The corrected compiler passed a full self-host bootstrap and byte comparison
of stage-two/stage-three generated C. `.build/gui/bootstrap-final.log` retains
that run. `sh native/tests/gui.sh` then passed all eight real widget types,
Unicode, duplicate labels, state updates, invalid-mutation preservation, close
lifecycle, GC stress, public type errors and AppKit native actions; output is
in `.build/gui/acceptance-final.log`. The AppKit action run includes 20 closed
windows retained until final release.

After that baseline pass, source review tightened missing-id validation for
untyped `get()` calls and added the `native-gui` project template. Their extra
checks are included in the final GUI gate and require the coordinated release
compiler rebuild. Do not treat the earlier baseline log as verification of
these later additions. A peer source review found no concrete GC/root or
AppKit lifetime defect; it was not an independent dynamic test run.

The native Task Desk example passed `arya check` and a release build to
`.build/gui/task-desk` (log `.build/gui/task-desk-build.log`). A Python
subprocess probe launched that actual executable with isolated `DATA_FILE`
paths containing malformed JSON, an invalid task row, and a directory. Each
exited nonzero before opening a window and preserved its input. This verifies
startup rejection, not interactive CRUD; interaction is a separate GUI check.

## Release runner evidence

The macOS job in [run 43470021848](https://github.com/HamzaArya/arya-lang/actions/runs/43470021848)
passed the final self-hosted compiler, full core/API gates and direct GUI gate
on macOS 15 ARM64. The GUI gate includes the later missing-id validation and
`native-gui` template, as well as real AppKit controls and action/lifetime
checks. Its SDK compiler and generated-C identities are recorded in the
[platform qualification log](verification/2.0.0/platform-qualification.md).

Windows runners passed the direct Win32 action harness, including button,
duplicate choices, input change/submission, multiline edit, close and retained
closed handles. The full native SDK bootstrap also passed on Windows. The
following public-language test initially removed the required Cygwin DLL search
path; the harness now uses an empty POSIX PATH while Cygwin supplies its native
DLL loader directory. That isolation probe passed on an actual Windows runner
in [run 43478802288](https://github.com/HamzaArya/arya-lang/actions/runs/43478802288).
The final public GUI and Windows distribution gates are still pending.

The Linux independent fresh-source suite passed in
[run 43474217260](https://github.com/HamzaArya/arya-lang/actions/runs/43474217260).
After the HTTP harness learned to retain the exact cooperative-stack sanitizer
warning while rejecting other stderr,
[desktop run 43478801468](https://github.com/HamzaArya/arya-lang/actions/runs/43478801468)
passed every bootstrap/core/API/HTTP, GTK and SDK distribution gate on Ubuntu
24.04 x64. GTK execution used Xvfb and passed all eight public widget types,
Unicode, state/validation/lifecycle cases, real toolkit events and retained
closed handles. A later run separately checks the final managed installer;
the GTK result already comes from actual Linux execution.
