# Arya documentation

For the independent 2.0 migration, start with the [native compiler guide](native-independence.md), [port table](../native/manifest.json), and [verification report](native-independence-report.md). The 1.3 guides below describe the retained Node compatibility implementation.

The [native performance and product development plan](native-performance-plan.md) turns the current benchmarks into phased compiler, runtime, financial-library, tooling, and release work with measurable acceptance criteria.

The [native function-call guide](native-function-calls.md) documents frame storage,
direct calls, recursive numeric specialization and their verification commands.

These guides cover **Arya’s Node.js application runtime** and the published **1.3.0-alpha.9** preview on `next`. The `latest` tag remains on 1.2.0-alpha.4 in the [publication record](releases/1.3.0-alpha.9-publication.json). Tags can move; installation examples pin a version. Unreleased stabilization changes are identified in the [changelog](../CHANGELOG.md). Node.js 22.15+ is required; Python, MySQL/mysql2, and Electron are optional feature dependencies.

| Version | Use it for |
| --- | --- |
| Published `1.3.0-alpha.9` | Canonical syntax, Node/npm/Python integration, services/MySQL, UI, editor tooling, and [business APIs](business-applications.md) |
| Older published `1.2.0-alpha.4` | Earlier syntax and native functionality; use its versioned documentation when maintaining an older installation |

Unreleased features need the compiler built from this checkout or a new matching archive. The creator without `--compiler` requires its exact compiler version on npm.

## Feature status

<!-- feature-status:start -->
| Feature | Availability | Scope |
| --- | --- | --- |
| [Formatter](business-applications.md) | Published since 1.3.0-alpha.7 | Indentation and outer whitespace; preserves tokens and comments. |
| [Parser recovery](business-applications.md) | Published since 1.3.0-alpha.7 | Up to 20 errors at top-level line boundaries. |
| [Optional types](business-applications.md) | Published since 1.3.0-alpha.7 | Bounded checking, Arya module contracts and declaration output. |
| [Editor references, rename and signatures](business-applications.md) | Published since 1.3.0-alpha.7 | Snapshot/open-document analysis; incomplete public renames are refused. |
| [Incremental project builds](business-applications.md) | Published since 1.3.0-alpha.7 | Contained graph builds with bounded compilation reuse. |
| [Closed-file workspace analysis](editor-and-compiler-improvements.md) | Unreleased source | Discovery, cached dependency analysis and static namespace rename. |
| [Mutation and control-flow checking](editor-and-compiler-improvements.md) | Unreleased source | Declared versus flow types, branch joins, loop writes and conservative capture invalidation. |
| [npm declaration imports](editor-and-compiler-improvements.md) | Unreleased source | Bounded named/default/CommonJS exports and non-generic overloads. |
| [Standard testing library](testing-library.md) | Unreleased source | Node-backed suites, hooks, assertions and mocks. |
| [Standard security library](security-library.md) | Unreleased source | Password hashing, tokens, HMAC and authenticated encryption. |
| [Node editor debugging](syntax-and-debugging.md) | Unreleased source | Arya source breakpoints, local inspection and stepping; requires a Node adapter and per-editor/platform qualification. |
| [Exact accounting batches](accounting-engine.md) | Unreleased source | Bounded invoice/ledger library with portable BigInt, optional native kernel and exact strings; no ISO currency registry or standalone compiler. |
| [Native scalar executable preview](native-preview.md) | Unreleased source | Shared frontend, verified typed IR and host LLVM executable for annotated scalar functions; broader language/runtime and platform qualification remain incomplete. |
| [Persistent Python worker](python-async.md) | Planned / unqualified | Current calls and batches use fresh child processes. |
| [Unicode identifiers and bidi editing](arya-roadmap.md) | Planned / unqualified | Needs a separately reviewed language/editor proposal. |
<!-- feature-status:end -->

## Start here

| Guide | Use it to |
| --- | --- |
| [First useful program](getting-started.md) | Start small, fix an error, and add Arya to a JavaScript project |
| [Install and upgrade](installing.md) | Install from npm or an archive, select a version, and troubleshoot setup |
| [Syntax migration](syntax-migration.md) | Upgrade from alternate spellings to canonical syntax in alpha.4 |
| [Command-line reference](cli.md) | Check/run/build, pass arguments, read JSON reports, and locate generated files |
| [Create a project](project-creator.md) | Choose web, API, CLI, UI, or desktop starters |
| [First programs](arya-tutorial.md) | Learn syntax through nine runnable lessons |
| [Task-report project](learning-path.md) | Build an application with multiple Arya modules |
| [Readable application syntax](flow-syntax.md) | Use pipelines, short functions, guards, indexed loops, cleanup, and collection helpers |
| [Language reference](arya-language.md) | Look up syntax, values, imports, and execution behavior |
| [Editor setup](editor-setup.md) | Enable bundled colors, icons, themes, and the setup tour |

## Application guides

| Guide | Contents |
| --- | --- |
| [JavaScript and Python](interop.md) | npm imports, JSON transport, requirements, and bridge errors |
| [Asynchronous Python](python-async.md) | Bound calls, keywords, batches, clients, cancellation, and environments |
| [Web applications](arya-web.md) | HTML-first servers, routes, assets, views, and standard libraries |
| [Services](services.md) | Validation, logging, request context, health checks, and shutdown |
| [Security library](security-library.md) | Password hashing, tokens, HMAC, and authenticated encryption; unreleased source candidate |
| [Arya Secure format](arya-secure-format.md) | Password upgrades, key rotation, context binding, and public interoperability vectors; unreleased source candidate |
| [Testing library](testing-library.md) | Tests, suites, hooks, assertions, mocks, and CI; unreleased source candidate |
| [MySQL](mysql.md) | Connections, prepared queries, transactions, errors, and testing |
| [Exact accounting batches](accounting-engine.md) | Small runtime, optional native arithmetic, invoice policy, ledger totals, and bounded async execution; unreleased prototype |
| [UI and desktop applications](ui-apps.md) | Declarative interfaces and Electron starters |
| [UI sections and templates](ui-patterns.md) | Compose page sections or start from a complete template |
| [UI and animation library](ui-library.md) | Components, state, forms, motion, and the preview/guide |
| [Syntax and debugging](syntax-and-debugging.md) | Defaults, optional access, code frames, Quick Fixes, and debug helpers |

Runnable projects are listed in the [examples index](../fixtures/README.md).

## Contracts and tooling

- [Language specification](arya-specification.md) and [Node.js runtime/migration](node-runtime.md).
- [Current architecture and gaps](architecture-audit.md), [native target architecture](architecture-target.md), [implementation milestones](implementation-roadmap.md), and the [master requirements](arya-master-plan.md).
- [Compiler, project, language-service, and editor APIs](compiler-api.md).
- [Native scalar executable preview](native-preview.md) and [native milestone evidence](native-milestone.md).
- [Unreleased editor/compiler improvements and benchmarks](editor-and-compiler-improvements.md).
- [Standard-library index](standard-library.md) for the libraries available in each execution profile.
- [Source-map design](source-maps.md) and [other editor integrations](arya-editors.md).
- [Compatibility policy](compatibility-policy.md), [contributing](../CONTRIBUTING.md), [security](../SECURITY.md), and [brand assets](../brand/README.md).

## Releases and decisions

- [Changelog](../CHANGELOG.md), [release index](releases/README.md), [published release](releases/1.3.0-alpha.9.md), and [verified npm publication](releases/1.3.0-alpha.9-publication.json).
- [Release process](releasing.md) and [current qualification](release-readiness.md).
- [Stable release plan](stable-release-plan.md): compatibility scope, engineering priorities and observable release criteria.
- [Roadmap](arya-roadmap.md), [tooling decisions](tooling-evidence.md), and [external learner review](community-review.md).
- [Historical archive](history/README.md): earlier audits/plans, extraction, the milestone roadmap, and retired native guides/contracts.

Historical plans and versioned release records describe their own dates and versions. Their hashes, test counts, and old registry tags remain evidence; use the current guides for installation.

Business application engineering: [APIs and limitations](business-applications.md), [phase plan and evidence](business-applications-plan.md).

The final [business engineering report](business-applications-report.md) records delivered behavior, exact artifacts, executed checks and remaining qualification.
