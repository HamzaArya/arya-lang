# Changelog

## 1.3.0-alpha.9 — local reliability candidate (unpublished)

- Check the documented decimal/datetime argument and result types in annotated modules; infer their exported result declarations. Unannotated modules keep runtime validation, and JavaScript Date objects remain a dynamic boundary.
- Audit stable candidate metadata on `latest` and prereleases on `next`, including matching editor preview flags, valid release versions, and compiler/creator version agreement.
- Include the creator archive, legal files, publication metadata and checksum in package-readiness checks. A mechanical pass does not declare stable qualification.
- Expand the CI matrix to the Node 22 minimum, current Node 22, Node 24 and Node 26 across Linux, Windows and macOS.
- Preserve LF source/fixture checkouts across platforms; emit immediate TAP failure details and bound test execution so leaked handles cannot consume the whole CI job.
- Update archive/editor packaging dependencies to fflate 0.8.3 and VSCE 4.1.0; scope a minimatch 11.0.7 override to VSCE to address known denial-of-service advisories.
- Align primary installation guides with published alpha.7 and document the [stable release plan](docs/stable-release-plan.md).

These changes are not in the frozen 1.3.0-alpha.7 archives. The new candidate is 1.3.0-alpha.9 with extension 1.3.4; neither is published. See [candidate changes and qualification](docs/releases/1.3.0-alpha.9.md).

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
- Published on npm's `next` tag and still experimental. See [contracts and limits](docs/business-applications.md)
  and [phase evidence](docs/business-applications-plan.md).


Arya is experimental. Versioned release notes contain compatibility details; [release readiness](docs/release-readiness.md) records actual qualification.

## Unreleased documentation

- Added a [CLI reference](docs/cli.md), a [release index](docs/releases/README.md), and file/JSON/path/math/environment contracts in the [standard-library reference](docs/standard-library.md).
- Clarified published-baseline versus source-candidate requirements and pinned consumer setup examples to the recorded published version.
- Corrected Python async/persistent-process claims, CLI argument handling, creator/archive version matching, and specification/API summaries.
- Replaced the milestone workboard with a [current roadmap](docs/arya-roadmap.md); moved superseded plans, audits, and retired native instructions into the [historical archive](docs/history/README.md), preserving their evidence and updating links.

## 1.3.0-alpha.4 — canonical syntax candidate

- Standardized on `const`, `fn`, `return`, `if`/`else`, `for`, and `print`; mutable bindings retain `let`.
- Removed alternate parser spellings and the implicit `say` builtin. The removed words are ordinary identifiers.
- Migrated starters, fixtures, active docs, snippets, grammars, completions, hover help, source highlighting, and the editor tour.
- Added rejection/reclaimed-name coverage and updated diagnostic/source-position checks.

See [candidate notes](docs/releases/1.3.0-alpha.4.md) and [syntax migration](docs/syntax-migration.md). This breaking prerelease candidate is not published to npm.

## 1.3.0-alpha.3 — UI sections and templates candidate

- Added ten components: container, buttonGroup, image, descriptionList, timeline, steps, pagination, segmented, search, and meter.
- Added navbar, hero, features, pricing, testimonials, FAQ, CTA, and footer sections.
- Added customizable landing, dashboard, settings, and sign-in templates with explicit server-action integration.
- Expanded live previews, copyable examples, the implementation guide, completions, and snippets.

See [candidate notes](docs/releases/1.3.0-alpha.3.md) and [sections/templates](docs/ui-patterns.md). This candidate is not published to npm.

## 1.3.0-alpha.2 — readable application flow candidate

- Added input-first and explicitly awaited pipelines, concise/default/rest functions, iterable spreads, checked guards, indexed loops, and finally cleanup.
- Added ten collection helpers with field selectors, stable copied sorting, safe grouping, and explicit async/error behavior.
- Updated starters, examples, highlighting, completion hints, snippets, and migration/specification docs.

See [candidate notes](docs/releases/1.3.0-alpha.2.md) and [syntax guide](docs/flow-syntax.md). This candidate is not yet published to npm.

## 1.3.0-alpha.1 — Node.js-only source candidate

- Retired native compilation, bootstrap, native project/API exports, editor settings, and CI.
- Kept five Node.js application templates, Python/npm integration, databases, UI/motion, and Electron desktop apps.
- Added shared unknown-library diagnostics, explicit errors for retired native requests, and a build that removes stale generated bundles.
- Preserved native work in Git history and retained published release evidence.

See [candidate notes](docs/releases/1.3.0-alpha.1.md) and [migration](docs/node-runtime.md). This entry does not claim npm publication.

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
