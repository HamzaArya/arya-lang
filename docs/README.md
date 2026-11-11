# Arya documentation

These guides cover **Arya’s Node.js application runtime** and the published **1.3.0-alpha.9** preview on `next`. The `latest` tag remains on 1.2.0-alpha.4 in the [publication record](releases/1.3.0-alpha.9-publication.json). Tags can move; installation examples pin a version. Unreleased stabilization changes are identified in the [changelog](../CHANGELOG.md). Node.js 22.15+ is required; Python, MySQL/mysql2, and Electron are optional feature dependencies.

| Version | Use it for |
| --- | --- |
| Published `1.3.0-alpha.9` | Canonical syntax, Node/npm/Python integration, services/MySQL, UI, editor tooling, and [business APIs](business-applications.md) |
| Older published `1.2.0-alpha.4` | Earlier syntax and native functionality; use its versioned documentation when maintaining an older installation |

Unreleased features need the compiler built from this checkout or a new matching archive. The creator without `--compiler` requires its exact compiler version on npm.

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
| [MySQL](mysql.md) | Connections, prepared queries, transactions, errors, and testing |
| [UI and desktop applications](ui-apps.md) | Declarative interfaces and Electron starters |
| [UI sections and templates](ui-patterns.md) | Compose page sections or start from a complete template |
| [UI and animation library](ui-library.md) | Components, state, forms, motion, and the preview/guide |
| [Syntax and debugging](syntax-and-debugging.md) | Defaults, optional access, code frames, Quick Fixes, and debug helpers |

Runnable projects are listed in the [examples index](../fixtures/README.md).

## Contracts and tooling

- [Language specification](arya-specification.md) and [Node.js runtime/migration](node-runtime.md).
- [Compiler, project, language-service, and editor APIs](compiler-api.md).
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
