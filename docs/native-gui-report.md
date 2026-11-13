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
- Native popup construction uses explicit `NSMenuItem` objects so duplicate
  labels remain separate choices. This prevents the duplicate-title collapse
  already reproduced in the earlier worker-host project.
- The core runtime still depends on POSIX `ucontext`, `poll`, `fork` and related
  facilities. A Win32 widget implementation does not by itself port those
  facilities to MinGW. Cygwin is the intended Windows qualification path for
  this revision; platform claims depend on actual runner results.

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
