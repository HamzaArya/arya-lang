# Arya 2.0.0 release work report

This report tracks the requested language repairs, direct native software support,
installation, editor package, commit and portfolio publication. The user explicitly
authorized including reviewed existing Arya changes in the release. Earlier project
reports retain their original evidence; new results identify their own source and
binary snapshots.

## Resolved language and application findings

| Reported problem | Implementation | Evidence |
| --- | --- | --- |
| Desktop module required web content | New `std gui` with AppKit, GTK 3 and Win32 controls, queued events, a native project template and persistent Task Desk example | AppKit, GTK and public Win32 widget/action/template gates passed with qualified native SDKs; [GUI report](native-gui-report.md). |
| Public filesystem only supported text | Six byte-file APIs and `security.hashBytes(Buffer)` preserve arbitrary binary content | macOS API/byte-oracle, limit, error, sanitizer and GC-stress gates passed; binary TextVault create/verify passed. |
| Application saves used predictable temporary paths | Atomic text/byte replacement uses exclusive random siblings and checked writes; 20 old stores migrated | [API repair report](native-api-repairs.md): 20 functional suites and 60 storage-entry checks passed. The six desktop workers were also rebuilt in the final application CI. |
| Valid inferred HTTP options rejected | Readonly input records for server options; four application `any` workarounds removed | Typed positive/negative checks and actual rebuilt server application suites passed. |
| Missing decimal rounding produced wrong diagnostic | Missing mode now reports the rounding error; typed arity remains enforced | Typed/dynamic API contracts and native decimal gates passed on macOS. |
| Programmer calculator manually emulated bit operations | Strict native UInt32 AND/OR/XOR/NOT and logical shifts in `math`; calculator migrated | 798 independently generated expected operation values and invalid-argument checks passed; the rebuilt calculator passed its 280 Python integer reference cases. |
| Finance calculators composed integer remainder from several operations | Exact `decimal.remainder` and parsed-value equivalent; both rational GCD helpers migrated | 184 independent scaled-integer vectors; 869 checks per release/reference/sanitizer mode passed in macOS qualification. Both migrated calculator suites passed in final application CI. |
| API-only services required their original source folder | `web.serve` resolves a static root only when HTML or assets are enabled | The relocated executable/source-removal HTTP regression passed in macOS qualification. |
| Collection iteration lost pending entries during mutation | Each Map/Set traversal retains its own compaction guard through exhaustion or abrupt completion | [Collection mutation regression](verification/2.0.0/collection-mutation.md): 26 checks per optimized/reference/sanitizer mode, with GC stress; repeated successfully in macOS qualification. |
| Empty array operations invoked undefined C behavior | Guard zero-length pointer arithmetic and memory copies in concat, slice, unshift, splice, copyWithin and sort | Focused fresh/retained-storage sanitizer regression and the original failing CSV path passed in macOS qualification. |
| Windows editor paths mixed native and POSIX forms | Cygwin mount-aware conversions and Windows file-URI transport | Unix path checks and actual native Windows CLI/LSP transport passed, including Unicode/space paths, definitions, hover and rename file URIs. |
| No versioned installation and stable editor package | Checksum-verified versioned installers and bundled/portable VSIX modes derived from version 2.0.0 | [Both actual macOS editor hosts passed](verification/2.0.0/generation-2/distribution.md); native macOS/Linux/Windows SDK installation and relocation gates passed. |

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
  The resulting full Linux runtime, GTK, SDK and actual installer gates passed.
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
  removed the required Cygwin DLL search path. The corrected harness and the complete
  Windows SDK/editor/native GUI rerun subsequently passed. Missing Cygwin sanitizer
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
- A later Windows bootstrap completed, but its artifact controller rejected
  Cygwin's standard binary checksum marker (`hash *filename`). The installer and
  controller now accept both standard text and binary markers, and all new
  inventories explicitly use binary hashing. The actual Cygwin fixture passed
  with CRLF, NUL, control bytes and a compiled PE file before the current bootstrap.
  The original controller validated before preserving the archive, so that runner's
  completed bootstrap could not be recovered. Capture now preserves the archive
  before optional validation; reuse checks its immutable GitHub origin, full
  inventory, compiler convergence, toolchain and all 260 native build inputs.
- The revised installer was separately requalified on Ubuntu using the exact
  previously qualified Linux SDK, without rebuilding or relabeling its compiler.
  Installation with `HOME` unset and a path containing spaces and an apostrophe
  passed, followed by actual CLI creation, checking, compilation and execution.
  Ordinary and beyond-binary64 exact decimal outputs both matched. The
  [immutable run and artifact evidence](verification/2.0.0/linux-installer-recheck.json)
  records the current installer digest and preserves the earlier SDK identity.
- Windows run `43488694656` then passed eleven of its twelve runtime groups,
  including the public Win32 GUI, typed API contracts and relocated HTTP service.
  The byte-security program exposed a real compiler link defect: OpenSSL's
  Cygwin certificate-store implementation requires `-lcrypt32`. The compiler now
  adds that dependency for crypto builds on Cygwin, matching the vendored
  OpenSSL configuration. This changes compiler source, so the earlier SDK,
  application and bundled-editor results remain historical; final artifacts
  required fresh qualification, which subsequently passed on all three targets. No source-identity exception permits their reuse.
  The next Windows run also exercises security diagnostics and crypto from a
  relocated SDK. Its workflow collects runtime, editor, installation and
  dependency results independently, then rejects qualification unless every
  required group passed. The final Windows job passed that aggregate gate.

## Release gates and publication

Version: **2.0.0 stable**. Platform qualification is complete for macOS ARM64,
Linux x64 and Windows x64 with Cygwin. Final archive assembly and public release
are separate steps; this source snapshot does not claim publication before it
occurs. The [machine-readable qualification](../native/qualification/2.0.0.json)
records exact compiler identities and the publication state at assembly time.

The corrected native compiler/runtime/library source is
`ce80487668e082ffd263c5239d737de7074e4dc4`.
[Desktop workflow 43495958933](https://github.com/HamzaArya/arya-lang/actions/runs/43495958933)
passed every platform job:

- macOS job `132128996700`: bootstrap, core, API/byte/HTTP, AppKit and SDK
  installation/packaging. The ARM64 compiler requires macOS 15.0 and has SHA-256
  `06d9dd9ce6d7447f3ce1ba15945538c9148ff896c7d09932f90fdad6b2c53c94`.
- Linux job `132128996654`: bootstrap, core, API/HTTP, GTK, relocation and actual
  managed installation on Ubuntu 24.04 x64. Its ELF compiler has SHA-256
  `13e39ee60c94e8a8b985d575c399ab6fe4031a47e04d5dbc5416b1b1197d01ff`.
- Windows job `132128996419`: fresh self-hosted PE bootstrap, runtime/Win32/API
  and crypto checks, native editor transport, relocated SDK, managed installation
  and dependency inspection. Its mandatory aggregate required actual success
  from runtime, editor, distribution and dependency groups. Cygwin remains a
  required runtime; this is not a standalone MSVC/MinGW package.

[Independent workflow 43495958819](https://github.com/HamzaArya/arya-lang/actions/runs/43495958819)
also passed on macOS and Linux: fresh-source compilation and installed SDK use
without Node/Python, then all arithmetic/compiler/type/LSP/documentation and
native authentication HTTP references. Exact platform proofs and retained logs
are linked from [platform qualification](verification/2.0.0/platform-qualification.md).

[Application workflow 43496335481](https://github.com/HamzaArya/arya-lang/actions/runs/43496335481),
job `132130301288`, rebuilt all twelve applications using the new qualified Mac
SDK. All engine suites, native protocols, signatures, archive extraction and
inventories passed. The downloaded bundles then passed local isolated native
protocol checks. Fresh Pocket Calculator and Study Desk launch/About spot checks
showed version 2.0.0; both apps were closed without calculation, editing or saving.
These AppKit applications require macOS 26 ARM64 and are ad-hoc signed, without
Developer ID signing or notarization. They are not Windows/Linux app ports.
[Current application evidence](verification/2.0.0/generation-2/application-release.md)
records the exact delivered bytes and the corrected local archive-inventory
assertion; no application was abandoned.

The rebuilt bundled VSIX and unchanged portable VSIX each passed all ten actual
VS Code host checks with the new Mac compiler. The portable host selected a
newly installed SDK through PATH, without a compiler override. Installation used
HOME unset and a prefix with spaces.
[Current editor and installer evidence](verification/2.0.0/generation-2/distribution.md)
keeps those identities separate from earlier attempts. These full editor-host
sessions were on macOS; the Windows result is the native CLI/LSP transport gate.

The [preceding qualification snapshot](verification/2.0.0/generation-1-qualification.json),
[SDK pins](verification/2.0.0/generation-1-sdk-assembly-inputs.json), old application
archives and failed-attempt logs remain preserved. They are not relabeled as
proof of the corrected compiler. No native build-input equality check was relaxed.

The final SDKs retain each original compiler, library and build/source identity.
Separate `ASSEMBLY-*` records describe later installer, documentation and
qualification metadata. The reviewed freeze commit is the target of `v2.0.0`;
subsequent delivery evidence records artifact hashes, actual public downloads and
portfolio deployment without moving the tag or repacking tested payloads.

The portfolio changes use an isolated clean worktree and the existing
Hostinger Git deployment for `hamzaarya.com`. Public release and portfolio URLs
will be recorded after their actual bytes and deployment are verified.
