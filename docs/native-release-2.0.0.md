# Arya 2.0.0 release work report

This report tracks the requested language repairs, direct native software support,
installation, editor package, commit and portfolio publication. The user explicitly
authorized including reviewed existing Arya changes in the release. Earlier project
reports retain their original evidence; new results identify their own source and
binary snapshots.

## Resolved language and application findings

| Reported problem | Implementation | Evidence |
| --- | --- | --- |
| Desktop module required web content | New `std gui` with AppKit, GTK 3 and Win32 controls, queued events, a native project template and persistent Task Desk example | AppKit and template gates passed in the qualified macOS SDK; [GUI report](native-gui-report.md). Linux/Windows qualification remains pending. |
| Public filesystem only supported text | Six byte-file APIs and `security.hashBytes(Buffer)` preserve arbitrary binary content | macOS API/byte-oracle, limit, error, sanitizer and GC-stress gates passed; binary TextVault create/verify passed. |
| Application saves used predictable temporary paths | Atomic text/byte replacement uses exclusive random siblings and checked writes; 20 old stores migrated | [API repair report](native-api-repairs.md): 20 functional suites and 60 storage-entry checks passed. The six desktop workers were also rebuilt in the final application CI. |
| Valid inferred HTTP options rejected | Readonly input records for server options; four application `any` workarounds removed | Typed positive/negative checks and actual rebuilt server application suites passed. |
| Missing decimal rounding produced wrong diagnostic | Missing mode now reports the rounding error; typed arity remains enforced | Typed/dynamic API contracts and native decimal gates passed on macOS. |
| Programmer calculator manually emulated bit operations | Strict native UInt32 AND/OR/XOR/NOT and logical shifts in `math`; calculator migrated | 798 independently generated expected operation values and invalid-argument checks passed; the rebuilt calculator passed its 280 Python integer reference cases. |
| Finance calculators composed integer remainder from several operations | Exact `decimal.remainder` and parsed-value equivalent; both rational GCD helpers migrated | 184 independent scaled-integer vectors; 869 checks per release/reference/sanitizer mode passed in macOS qualification. Both migrated calculator suites passed in final application CI. |
| API-only services required their original source folder | `web.serve` resolves a static root only when HTML or assets are enabled | The relocated executable/source-removal HTTP regression passed in macOS qualification. |
| Collection iteration lost pending entries during mutation | Each Map/Set traversal retains its own compaction guard through exhaustion or abrupt completion | [Collection mutation regression](verification/2.0.0/collection-mutation.md): 26 checks per optimized/reference/sanitizer mode, with GC stress; repeated successfully in macOS qualification. |
| Empty array operations invoked undefined C behavior | Guard zero-length pointer arithmetic and memory copies in concat, slice, unshift, splice, copyWithin and sort | Focused fresh/retained-storage sanitizer regression and the original failing CSV path passed in macOS qualification. |
| Windows editor paths mixed native and POSIX forms | Cygwin mount-aware conversions and Windows file-URI transport | Unix URI/editor-path checks passed. Actual Windows editor transport and complete distribution qualification remain pending. |
| No versioned installation and stable editor package | Checksum-verified versioned installers and bundled/portable VSIX modes derived from version 2.0.0 | [Actual macOS installer and both editor-host gates passed](verification/2.0.0/distribution.md); Windows/Linux release qualification remains separate. |

Atomic visibility is not an fsync durability guarantee. Stateful examples retain
single-writer and size limits. Business features outside the earlier application
briefs (hosted worker fleets, bank integrations, multiwriter databases) are not
language defects and are not reported as newly implemented.

## Problems encountered during this release

- The first integrated GUI binary could not import `gui`: its export registration
  was accidentally inside the WebKit desktop guard. The separate guard was fixed;
  the complete macOS widget/action and project-template gates now pass.
- Fresh bootstrap initially rejected a private `_path` import because the shipped
  seed predates that import. The compiler-facing hook now uses the existing public
  path import. The frozen seed remains unchanged; final macOS self-hosting and
  stage-two/stage-three generated-C convergence passed.
- The first GitHub push timed out with HTTP 408. A buffered HTTP/1.1 retry succeeded;
  no force push or history rewrite was used.
- Concurrent compilation increased macOS swap use and reduced free disk space.
  Compilation was serialized and historical evidence preserved. One local full
  check exhausted disk during accounting-journal sanitizer compilation; a later
  bootstrap was stopped to avoid another exhaustion. Neither partial run is
  reported as complete. Remote macOS CI subsequently completed the final native
  gates and supplied the verified SDK used for installation and application builds.
- The first Ubuntu relocated-compiler test omitted GCC's assembler/linker tools
  from its restricted PATH. The harness now supplies those build tools while
  keeping Node/Python unavailable. A later Linux test exposed an invalid temporary
  directory template; adding the required `XXXXXX` suffix corrected that fixture.
  The resulting Linux qualification rerun remains pending.
- Linux and macOS CI exposed the empty-array undefined behavior recorded above.
  The runtime guards and focused regressions passed the macOS release gates.
- Map/Set mutation could move pending entries behind a live loop cursor. Separate
  rooted iterator guards now preserve traversal state and release on exhaustion,
  break, return and exceptions. An initial reference-mode storage assertion also
  counted its own range allocation; replacing that test loop with a numeric loop
  removed the unrelated allocation without weakening the memory bound.
- The first decimal-remainder CI fixture passed nullable indexed values to a
  string-only API. Its explicit vector-shape check and nonnullable bindings fixed
  that test typing error. All 869 runtime checks then passed in each macOS mode.
- Cygwin `fork` could not clone the compiler's managed task stack. Windows
  `process.run` now uses direct process spawning; a Windows runner subsequently
  completed the full self-hosted SDK bootstrap. Later Windows test isolation
  removed the required Cygwin DLL search path. That harness repair and the complete
  Windows SDK/editor/native GUI rerun remain pending. Missing Cygwin sanitizer
  libraries and unsupported file-size fault injection are recorded as unavailable,
  not as successful sanitizer or injection results.
- The first portable VSIX host attempts hit macOS's IPC socket-path limit and then
  a directly launched editor's replacement of the test PATH. Compact isolated
  profiles and the real CLI-launch environment fixed the harness. Both bundled and
  portable editor packages then passed all ten language-service checks. Their
  failures, successful retries and exact hashes are in the [distribution record](verification/2.0.0/distribution.json).
- The real installer smoke added to the Unix distribution gate exposed an
  environment dependency: supplying `--prefix` still evaluated `HOME` before
  parsing arguments. The installer now requires `HOME` only for its default
  location. Explicit-prefix installation without `HOME`, missing-default rejection
  and empty-prefix rejection passed the packaging regressions. The Unix gate now
  installs a real SDK into a path containing spaces, creates a CLI project with
  the installed command, checks and builds it, and requires the exact native output.
- Linux's relocated HTTP test exited successfully but emitted GCC's exact ASan
  `makecontext/swapcontext` capability warning. The harness now retains that warning
  in its log only for sanitizer builds; all other stderr still fails. Fifteen
  focused acceptance/rejection cases passed. The same final macOS HTTP test also
  passed locally with the original 15-second startup bound; an earlier preliminary
  stage-one timeout has no established cause and remains in the evidence.

## Release gates and publication

Version: **2.0.0**. Status: **qualification in progress**, not yet a published stable
release. [Machine-readable qualification](../native/qualification/2.0.0.json) is
updated only from actual results. Prior alpha evidence is not reused as proof of
this release.

The frozen compiler/runtime/library snapshot is commit
`0dc38b789df2840aa2977769065479c578e70649`.
[Desktop workflow 43470021848](https://github.com/HamzaArya/arya-lang/actions/runs/43470021848)
passed every macOS gate, including core regressions, API contracts, HTTP relocation,
AppKit and SDK packaging. The macOS job in
[independent workflow 43470021846](https://github.com/HamzaArya/arya-lang/actions/runs/43470021846)
also passed the fresh source build, installed SDK and independent reference gates.
The qualified ARM64 compiler has minimum macOS 15.0 and SHA-256
`fdd021f30cdbb09165898beb01ce189d76af4d4714ad119640748695ba2e07d1`.

[Application workflow 43475142800](https://github.com/HamzaArya/arya-lang/actions/runs/43475142800),
from application/controller commit `5d3286445587fec596b76f912f70cc1575679c75`,
passed all twelve application builds and suites using that exact qualified SDK.
It verified native host/worker protocols, signatures, archive extraction and
checksums. These AppKit application bundles target macOS 26 ARM64 and are ad-hoc
signed; they are not notarized or Windows/Linux ports. Automated CI is separate
from the earlier recorded manual GUI sessions.

The actual macOS versioned installer, installed CLI build/run, bundled VSIX and
portable VSIX gates also passed; their identities are recorded in
[distribution qualification](verification/2.0.0/distribution.md). Linux and
Windows/Cygwin qualification are still pending. This macOS evidence is not a
claim of completed cross-platform qualification.

The repository branch is `release/2.0.0-native`. Final distribution metadata,
release assets and public download URLs will be recorded after the remaining
gates and publication complete. The portfolio update is isolated from unrelated
dirty site work and uses the existing signed-in Hostinger/GitHub deployment route.
No successful release or portfolio publication is claimed here yet.
