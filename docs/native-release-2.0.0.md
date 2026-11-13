# Arya 2.0.0 release work report

This report tracks the requested language repairs, direct native software support,
installation, editor package, commit and portfolio publication. The user explicitly
authorized including reviewed existing Arya changes in the release. Earlier project
reports remain historical records; this release does not relabel their old binaries.

## Resolved language and application findings

| Reported problem | Implementation | Evidence |
| --- | --- | --- |
| Desktop module required web content | New `std gui` with AppKit, GTK 3 and Win32 controls, queued events, a native project template and persistent Task Desk example | [GUI report](native-gui-report.md); platform gates recorded separately |
| Public filesystem only supported text | Six byte-file APIs and `security.hashBytes(Buffer)` preserve arbitrary binary content | API tests with independent byte oracle, limits, errors, sanitizers and GC stress; binary TextVault create/verify passed |
| Application saves used predictable temporary paths | Atomic text/byte replacement uses exclusive random siblings and checked writes; 20 old stores migrated | [API repair report](native-api-repairs.md), 20 functional suites and 60 storage-entry checks |
| Valid inferred HTTP options rejected | Readonly input records for server options; four application `any` workarounds removed | Typed positive/negative tests and actual rebuilt server applications |
| Missing decimal rounding produced wrong diagnostic | Missing mode now reports the rounding error; typed arity remains enforced | API contract and native decimal tests |
| Programmer calculator manually emulated bit operations | Strict native UInt32 AND/OR/XOR/NOT and logical shifts in `math`; calculator migrated | 798 independently generated expected operation values plus invalid argument tests; final execution pending |
| Finance calculators composed integer remainder from several operations | Exact `decimal.remainder` and parsed-value equivalent; both rational GCD helpers migrated | 184 independent scaled-integer reference vectors; rebuilt execution pending |
| API-only services required their original source folder | `web.serve` resolves a static root only when HTML or assets are enabled | Relocated executable/source-removal HTTP regression prepared; execution pending |
| Windows editor paths mixed native and POSIX forms | Cygwin mount-aware conversions and Windows file-URI transport | Unix URI and real Windows editor tests; final qualification pending |
| No versioned installation and stable editor package | Checksum-verified macOS/Linux installer; bundled and portable VSIX modes derive stable metadata from version | Packaging fixture checks passed; final SDK/host checks pending |

Atomic visibility is not an fsync durability guarantee. Stateful examples retain
single-writer and size limits. Business features outside the earlier application
briefs (hosted worker fleets, bank integrations, multiwriter databases) are not
language defects and are not reported as newly implemented.

## Problems encountered during this release

- The first integrated GUI binary could not import `gui`: its export registration
  was accidentally inside the WebKit desktop guard. The guard was corrected and
  the integrated AppKit widget/action gate passed.
- The first fresh bootstrap after Windows URI changes rejected a private `_path`
  import in a compiler module because the shipped bootstrap seed predates that
  private import. The frozen seed is preserved; the compiler-facing hook is being
  routed through the existing public path import.
- The first GitHub push timed out with HTTP 408. A buffered HTTP/1.1 retry succeeded;
  no force push or history rewrite was used.
- Concurrent compilation increased macOS swap use and reduced free disk space.
  Compilation was serialized; historical evidence and artifacts were preserved.
  A later full local check exhausted disk while compiling the accounting-journal
  sanitizer binary. Earlier suites passed, but that incomplete run is not counted
  as a full pass. Free space subsequently recovered and qualification resumed.
- The first Ubuntu SDK built successfully, including GTK 3. A relocated-compiler
  test then exposed a test environment missing GCC's assembler/linker tools.
  The restricted PATH test is being repaired while keeping Node/Python absent.
- Linux and macOS CI caught undefined C behavior when concatenating empty lists:
  zero-length storage was passed through null pointer arithmetic and `memcpy`.
  Empty `slice`, `unshift`, `splice`, `copyWithin` and `sort` paths received the
  same guard, with a focused fresh/retained-storage sanitizer regression.
- Review found native Map/Set `for` iteration could skip remaining entries after
  deletion triggered storage compaction. Active-iterator lifetime and mutation
  regressions are being repaired before release qualification.
- Windows reached the second self-hosting stage but Cygwin `fork` could not clone
  the compiler's managed execution stack. A Windows process-launch repair and
  actual Windows SDK qualification are in progress.

## Release gates and publication

Version: **2.0.0**. Status: **qualification in progress**, not yet a published stable
release. [Machine-readable qualification](../native/qualification/2.0.0.json) is
updated only from actual results. Prior alpha platform evidence is not reused as
proof of the new release.

The repository branch is `release/2.0.0-native`. Release assets, installer and VSIX
will be frozen after their gates pass. The portfolio update is isolated from
unrelated dirty site work, and the existing signed-in Hostinger session is used
for the requested publication. Actual public asset URLs and verification results
will be recorded here when publication succeeds.
