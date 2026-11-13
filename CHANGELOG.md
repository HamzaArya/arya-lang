# Changelog

## 2.0.0 — stable release qualification in progress

- Add `std "gui"` for direct AppKit, GTK 3 and Win32 widgets and queued native events. Platform implementations are qualified separately. Windows builds use Cygwin’s POSIX runtime; a standalone MSVC/MinGW port is not claimed.
- Add bounded binary filesystem reads/writes/appends, atomic text/byte replacement and SHA-256 over raw buffers. Upgrade the earlier applications to use the repaired APIs.
- Correct readonly HTTP-server option contracts and missing decimal rounding diagnostics.
- Add exact `decimal.remainder` and parsed-value remainder, and native UInt32 bitwise operations; migrate the finance, precision and programmer calculators to these APIs.
- Repair mutation during Map/Set iteration, empty-array undefined behavior and API-only HTTP service relocation after source removal.
- Repair Cygwin process launching and native Windows editor paths; keep the optional Windows Python bridge explicitly unsupported.
- Add checksum-verified versioned installation and bundled/portable stable VSIX packaging.
- Rebuild all twelve native macOS applications with the qualified SDK, correct About versions and preserve earlier artifacts and work reports.
- Verify actual installation paths containing spaces, explicit prefixes without HOME, and both standard checksum markers; new release checksums explicitly use binary mode.
- Include the reviewed, previously unpublished compiler, runtime, syntax, authentication and documentation work listed below.


## 2.0.0-alpha.3 — local candidate

- Improved macOS biometrics with native async cancellation/deadlines, a single-operation prompt gate, noninteractive checks, structured OS errors and authenticated credential replacement that preserves Keychain access controls. Added isolated adapter tests for late callbacks and cancellation/write races.
- Add `std "auth"`: native indexed bearer sessions, one-use challenges, password migration, RFC TOTP/PKCE, recovery codes, attempt limits and macOS LocalAuthentication/Keychain integration, with typed contracts, examples and sanitizer/vector tests. See [native authentication](docs/native-auth.md) for storage and platform boundaries.
- Add record property shorthand, string computed keys and shallow record spread with source diagnostics, evaluation-order/GC checks, conservative structural typing and key-preserving LSP rename. Existing canonical syntax remains valid.
- Consolidate current native documentation, remove duplicate retired-profile guides while preserving their originals, and document SDK/source/application installation on other computers.
- This candidate includes the earlier unpublished engineering changes below. Existing alpha.2 archives and performance records remain immutable. See [syntax and documentation qualification](docs/native-syntax.md).

### Included native engineering improvements

- Fuse eligible `Number(value.toFixed(...))` calls without temporary managed strings while preserving exact rounding, selected callees, evaluation order and diagnostics. Add bounded ASCII conversion paths and independent numeric/Unicode guard tests. The unchanged Ledger comparison measures 19.4% less aging latency and 14.2% less allocation latency; report and production services remain effectively flat. See [measurements and limitations](docs/native-ledger-fastpaths.md).

- Avoid temporary bound methods for immediate numeric calls, coallocate shared UTF-16 string buffers, and use bounded ARM64 JSON scanning with scalar differential and protected-page checks. Extend exact integer fixed formatting through 100 places, improve private global lookup, and guard optimized fresh data descriptors. See the [runtime optimization evidence](docs/native-fastpaths.md), including compilation costs and unchanged workloads.

- Add transaction validation, immutable prepared journals, trial balances and classified financial statements using exact monetary strings; preserve aggregate ledger diagnostics.
- Reject validation accessors without running them, check schema depth before integer conversion, and use indexed field lookup for strict schemas.
- Fix false circular log values and oversized trace error propagation; bound record/promise inspection and add an allocation-free logging-level guard.
- Pin the supported OpenSSL 3.5.9 LTS release, verify its upstream checksum, and key crypto build caches by source identity to prevent stale-library reuse.
- Optimize common binary64 fixed formatting with exact integer rounding and retain the arbitrary-precision fallback; add independent reference and allocation evidence.
- Bound unary parser recursion with source diagnostics and add seeded malformed-source checks.
- Make standalone SDK contents independent of optional editor builds, require full SDK libraries for packaging, and update native onboarding and acceptance gates.

These are working-tree changes, not a published release or a claim of stable production support. See the [audit, verification and remaining work](docs/native-professionalization.md).

## 2.0.0-alpha.2 — 2026-11-12

- Complete the native compiler/runtime and standard-module migration, including native language services, formatter, test runner, project creator, editor SDK and all application templates. Core builds and programs require no Node/npm/Python.
- Add exact native invoice/ledger batches, parsed decimal values, currency-safe Money, opt-in finance policies, bounded incremental CSV and UTF-8 input chunks. Preserve the existing financial worker protocol and existing Ledger installations/data.
- Qualify three-generation source convergence, sanitizer/collector tests, independent arithmetic references, live HTTP/Python/MySQL/desktop/editor integrations and relocated SDK operation on macOS ARM64.
- Preserve the previous Node implementation and all original working bytes under compat/node; retain earlier release artifacts unchanged. Publish the source inventory, dependency provenance, performance measurements and explicit platform/profile limits.

### Advanced native call optimization

- Add bounded number/boolean monomorphization with tag-guarded entries, mixed scalar locals/results, short-circuit lowering and recursive call-graph type propagation.
- Root scalar lexical environments at their entry boundary, avoid redundant roots for generated dynamic calls and cache outer environment pointers while retaining mutable cells and error/depth behavior.
- Preserve signed zero when the earlier numeric path converts a boolean before unary minus.
- Add 47 advanced semantic assertions, three execution profiles, sanitizer/GC-stress checks, structural root/lookup budgets and an optional native benchmark controller. See [implementation and measurements](docs/native-advanced-calls.md).

### Native function-call optimization

- Classify native binding captures and writes; keep uncaptured locals in rooted frame slots and omit unnecessary lexical environments while preserving shared captures, TDZ and live exports.
- Emit direct synchronous calls to proven targets and specialize eligible numeric call graphs, including recursion. Preserve argument evaluation, dynamic fallback, source traces and the 512-call limit.
- Bound stack temporary buffers, retain suspended-frame roots and give debug/sanitizer task stacks capacity for instrumented recursion.
- Add optimized/reference conformance, GC-stress/sanitizer and allocation checks, optional runtime counters, and a reproducible call benchmark. See [implementation and evidence](docs/native-function-calls.md).

## Native 2.0.0-alpha.1 migration in progress

- Add a native, self-hosted compiler and C11 bootstrap/SDK build that requires no Node, npm or Python. Require generated-C convergence across native generations.
- Add native managed values, closures, relative modules, strings/dense collections, current syntax foundations, exact libmpdec decimal functions, Ryu formatting, JSON and collection helpers.
- Add Node/Python-free relocation, GC stress, sanitizer, publication/cleanup and independent decimal reference checks. Retain the 1.3 compatibility source and reviewed archives.
- Track all partial/unported libraries explicitly in [the migration manifest](native/manifest.json). The full language/library migration is not complete. Arya Ledger remains untouched.

## Unreleased — 1.3.0-alpha.12 candidate

- Add an opt-in `arya native` command and `arya-language/native-preview` API. Shared frontend analysis lowers a bounded scalar subset to verified typed IR and LLVM; Clang links a host executable that runs without Node or Python.
- Preserve existing binary64 arithmetic, numeric output, boolean short circuit and argument evaluation order. Unsupported constructs receive source-located diagnostics. Default JS builds and retired native flags retain their contracts.
- Add deterministic IR inspection, structural/type/scope validation, debug/release modes, exclusive atomic output publication and native differential/relocation/toolchain-failure tests.
- Retain alpha.11 artifacts and exact accounting behavior. Broader native language coverage, runtime/GC, cross-platform qualification and production backend selection remain open.

See [native preview contracts](compat/node/docs/native-preview.md) and [milestone evidence](compat/node/docs/native-milestone.md).

## Retained 1.3.0-alpha.11 candidate

- Add a separate exact invoice/ledger batch runtime with portable BigInt and an optional Node-API C++ kernel. Check signed line bounds, retain exact aggregate strings, expose all nine rounding modes and an explicit per-line policy, and support reusable immutable batches and cooperative cancellation.
- Package the accounting runtime separately without npm runtime dependencies or install scripts. Keep the compiler, editor and existing decimal library independent; select native execution only for eligible batches and retain explicit fallback controls.
- Add independent Python Decimal comparisons, native buffer/worker checks, sanitizer checks, repeatable accounting benchmarks and offline standalone package acceptance.
- Audit the current architecture and feature gaps, preserve the master requirements, and document the staged typed IR/native compiler migration. A standalone native compiler, ISO currency registry and broader accounting ecosystem remain planned.
- Generate the security policy's published-version paragraph from the same publication record as other current status pages.

See [accounting contracts](docs/accounting-engine.md) and [milestone evidence](compat/node/docs/accounting-milestone.md). This is an unpublished prototype, not a stable financial release.

## Retained 1.3.0-alpha.10 candidate

- Preserve assertion behavior on Node 26 by omitting absent optional messages while retaining required undefined values. Cover no-message, explicit undefined and custom-message comparisons.

- Separate declared and flow types, join continuing branches, check loop/exception writes and conservatively invalidate captured-variable narrowing. Prevent unsafe widening of mutable record/array aliases and check compound assignments and array write contracts.
- Read default/CommonJS exports, local export aliases, single ambient modules and bounded non-generic overloads from declarations. Exercise pinned real npm packages, passive imports, overload editor details and TypeScript declaration consumers.
- Format core source with a pinned formatter and extract type representation and source effects into smaller modules; check formatting in CI.
- Generate shared feature availability from one status file and reconcile outdated tooling decisions. Prepare an artifact-pinned learner exercise and observation template; real sessions remain pending.

- Extend Arya Secure with login-time hash upgrades, bounded standard/strong scrypt profiles, keyrings and rotation, and authenticated account/purpose context. Preserve single-key v1 compatibility; document v2 envelopes in a [format specification](compat/node/docs/arya-secure-format.md) with public interoperability vectors and a Python verifier.
- Add `security` for salted scrypt passwords, cryptographic tokens, HMAC-SHA-256, and AES-256-GCM encryption, plus `testing` for Node-backed suites, async tests, hooks, strict assertions, and mocks. Include static signatures, editor hints, runnable examples, and security/error regressions; see the [security](compat/node/docs/security-library.md) and [testing](compat/node/docs/testing-library.md) guides.
- Discover closed workspace files in both editor adapters; share incremental analysis for diagnostics, imported definitions, references, signatures and static namespace rename.
- Add standard-library signatures, list element propagation and a bounded `.d.ts` reader for checked imports. Explicit trusted boundaries remain available.
- Separate AST parsing and JavaScript emission, bound AST structural depth, select only needed standard runtimes and bundle build entry points together.
- Add seeded malformed-input/runtime conformance cases, incremental reuse tests, closed-file protocol tests and repeatable performance benchmarks.
- Generate shared published-release status from one immutable record and reject stale status paragraphs during documentation checks.

These changes require a new artifact version and fresh qualification; published alpha.9 bytes remain unchanged. See [implementation and limits](compat/node/docs/editor-and-compiler-improvements.md).

## 1.3.0-alpha.9 — published reliability preview

- Check the documented decimal/datetime argument and result types in annotated modules; infer their exported result declarations. Unannotated modules keep runtime validation, and JavaScript Date objects remain a dynamic boundary.
- Audit stable candidate metadata on `latest` and prereleases on `next`, including matching editor preview flags, valid release versions, and compiler/creator version agreement.
- Include the creator archive, legal files, publication metadata and checksum in package-readiness checks. A mechanical pass does not declare stable qualification.
- Expand the CI matrix to the Node 22 minimum, current Node 22, Node 24 and Node 26 across Linux, Windows and macOS.
- Preserve LF source/fixture checkouts across platforms; emit immediate TAP failure details and bound test execution so leaked handles cannot consume the whole CI job.
- Update archive/editor packaging dependencies to fflate 0.8.3 and VSCE 4.1.0; scope a minimatch 11.0.7 override to VSCE to address known denial-of-service advisories.
- Align primary installation guides with published alpha.7 and document the [stable release plan](compat/node/docs/stable-release-plan.md).

These changes are not in the frozen 1.3.0-alpha.7 archives. The new release is 1.3.0-alpha.9 on npm’s `next` channel with published extension 1.3.4. See [candidate changes and qualification](docs/releases/1.3.0-alpha.9.md).

- Correct optional type inference for fallthrough, required parameter positions, list/call spreads, and try/catch/finally control flow. Add runtime and declaration regressions.
- Refresh dependency diagnostics across open/change/close, share one workspace analysis per buffer revision, refuse incomplete exported-symbol renames, and recover bounded unfinished completion/signature requests.
- Normalize web roots with native canonical paths and close test children before deleting their working directories; retain real Windows qualification as a separate gate.
- Keep local-only npm fixture/package acceptance installs explicitly offline.
- Keep compiler and extension identities separate in packaging and `arya editor status`; align current onboarding with the actual published version.
- Add a focused getting-started path and a mixed JavaScript/Arya module example without requiring a custom editor.

## 1.3.0-alpha.7 — published prerelease

- Isolate injected runtime dependencies from lexical module host bindings.
- Add exact decimal strings, strict dates/instants/zones and bounded async iterators.
- Add bounded optional types, unknown external declarations, module checking and `.d.mts` output.
- Add conservative formatting/lint, parser recovery, snapshot navigation/signatures,
  incremental compilation, esbuild adapter and explicit Node test entry points.
- Integrate an application-owned bank CSV preview in the separate Arya Ledger repository.
- Published on npm's `next` tag and still experimental. See [contracts and limits](compat/node/docs/business-applications.md)
  and [phase evidence](compat/node/docs/business-applications-plan.md).


Arya is experimental. Versioned release notes contain compatibility details; [release readiness](compat/node/docs/release-readiness.md) records actual qualification.

## Unreleased documentation

- Added a [CLI reference](docs/cli.md), a [release index](docs/releases/README.md), and file/JSON/path/math/environment contracts in the [standard-library reference](docs/standard-library.md).
- Clarified published-baseline versus source-candidate requirements and pinned consumer setup examples to the recorded published version.
- Corrected Python async/persistent-process claims, CLI argument handling, creator/archive version matching, and specification/API summaries.
- Replaced the milestone workboard with a [current roadmap](compat/node/docs/arya-roadmap.md); moved superseded plans, audits, and retired native instructions into the [historical archive](docs/history/README.md), preserving their evidence and updating links.

## 1.3.0-alpha.4 — canonical syntax candidate

- Standardized on `const`, `fn`, `return`, `if`/`else`, `for`, and `print`; mutable bindings retain `let`.
- Removed alternate parser spellings and the implicit `say` builtin. The removed words are ordinary identifiers.
- Migrated starters, fixtures, active docs, snippets, grammars, completions, hover help, source highlighting, and the editor tour.
- Added rejection/reclaimed-name coverage and updated diagnostic/source-position checks.

See [candidate notes](docs/releases/1.3.0-alpha.4.md) and [syntax migration](compat/node/docs/syntax-migration.md). This breaking prerelease candidate is not published to npm.

## 1.3.0-alpha.3 — UI sections and templates candidate

- Added ten components: container, buttonGroup, image, descriptionList, timeline, steps, pagination, segmented, search, and meter.
- Added navbar, hero, features, pricing, testimonials, FAQ, CTA, and footer sections.
- Added customizable landing, dashboard, settings, and sign-in templates with explicit server-action integration.
- Expanded live previews, copyable examples, the implementation guide, completions, and snippets.

See [candidate notes](docs/releases/1.3.0-alpha.3.md) and [sections/templates](compat/node/docs/ui-patterns.md). This candidate is not published to npm.

## 1.3.0-alpha.2 — readable application flow candidate

- Added input-first and explicitly awaited pipelines, concise/default/rest functions, iterable spreads, checked guards, indexed loops, and finally cleanup.
- Added ten collection helpers with field selectors, stable copied sorting, safe grouping, and explicit async/error behavior.
- Updated starters, examples, highlighting, completion hints, snippets, and migration/specification docs.

See [candidate notes](docs/releases/1.3.0-alpha.2.md) and [syntax guide](compat/node/docs/flow-syntax.md). This candidate is not yet published to npm.

## 1.3.0-alpha.1 — Node.js-only source candidate

- Retired native compilation, bootstrap, native project/API exports, editor settings, and CI.
- Kept five Node.js application templates, Python/npm integration, databases, UI/motion, and Electron desktop apps.
- Added shared unknown-library diagnostics, explicit errors for retired native requests, and a build that removes stale generated bundles.
- Preserved native work in Git history and retained published release evidence.

See [candidate notes](docs/releases/1.3.0-alpha.1.md) and [migration](compat/node/docs/node-runtime.md). This entry does not claim npm publication.

## Repository updates after 1.2.0-alpha.4

- Refreshed current guides, installation commands, examples, editor instructions, and security/compatibility status.
- Added documentation and examples indexes, a contributor guide, and documentation link checking.
- Updated CI to package both the compiler and initializer before installed-package acceptance.
- Protected retained release archives from accidental replacement by local packaging.

These source/documentation updates do not replace the published alpha.4 archives.

## 1.2.0-alpha.4 — 10 November 2026

Published compiler and creator on npm's `latest` tag. Added UI and motion with a preview/guide, UI and Electron starters, bundled editor setup/icons/themes/semantic highlighting, managed MySQL operations, service validation/logging/shutdown, asynchronous Python APIs, safer expressions, and clearer diagnostics.

See [release notes](docs/releases/1.2.0-alpha.4.md) and [verified publication](docs/releases/1.2.0-alpha.4-publication.json).

## Earlier previews

| Version | Changes |
| --- | --- |
| [1.2.0-alpha.3](docs/releases/1.2.0-alpha.3.md) | Interactive npm project creation and root-mounted web rendering |
| [1.2.0-alpha.2](docs/releases/1.2.0-alpha.2.md) | HTML-first web projects |
| [1.2.0-alpha.1](docs/releases/1.2.0-alpha.1.md) | Branded syntax, standard libraries, and inline views |
| [1.1.0-alpha.1](docs/releases/1.1.0-alpha.1.md) | C11 native backend and self-hosting |
| [0.2.0-alpha.3](docs/releases/0.2.0-alpha.3.md) | Modules, interoperability, and public distribution |
| [0.2.0-alpha.2](docs/releases/0.2.0-alpha.2.md) | Lexical name and constant-write checks |
| [0.2.0-alpha.1](docs/releases/0.2.0-alpha.1.md) | Original Arya source maps |
