# Changelog

Arya is experimental. Versioned release notes contain compatibility details; [release readiness](docs/release-readiness.md) records actual qualification.

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
