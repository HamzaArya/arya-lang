# Arya documentation

These guides describe **Arya 1.2.0-alpha.4**, published on npm's `latest` tag. The compiler requires Node.js 22.15+. Python, a C11 toolchain, MySQL/mysql2, and Electron are required only for features that use them. See [release readiness](release-readiness.md) for the tested scope.

## Start here

| Guide | Use it to |
| --- | --- |
| [Install and upgrade](installing.md) | Install from npm or an archive, select a version, and troubleshoot setup |
| [Create a project](project-creator.md) | Choose web, API, CLI, native, UI, or desktop starters |
| [First programs](arya-tutorial.md) | Learn syntax through nine runnable lessons |
| [Task-report project](learning-path.md) | Build an application with multiple Arya modules |
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
| [UI and animation library](ui-library.md) | Components, state, forms, motion, and the preview/guide |
| [Syntax and debugging](syntax-and-debugging.md) | Defaults, optional access, code frames, Quick Fixes, and debug helpers |
| [Native applications](arya-native.md) | C11 compilation, native APIs, and self-hosting |

Runnable projects are listed in the [examples index](../fixtures/README.md).

## Contracts and tooling

- [Core/Node specification](arya-specification.md) and [native profile](arya-native-specification.md).
- [Compiler, project, language-service, and editor APIs](compiler-api.md).
- [Standard-library index](standard-library.md) for the libraries available in each execution profile.
- [Source-map design](source-maps.md) and [other editor integrations](arya-editors.md).
- [Compatibility policy](compatibility-policy.md), [contributing](../CONTRIBUTING.md), [security](../SECURITY.md), and [brand assets](../brand/README.md).

## Releases and decisions

- [Changelog](../CHANGELOG.md), [current release](releases/1.2.0-alpha.4.md), and [verified npm publication](releases/1.2.0-alpha.4-publication.json).
- [Release process](releasing.md) and [current qualification](release-readiness.md).
- [Roadmap](arya-roadmap.md), [tooling decisions](tooling-evidence.md), and [external learner review](community-review.md).
- Historical background: [initial 0.2 plan](arya-0.2-initial-plan.md), [0.1 audit](arya-language-logic-report.md), [repository extraction](repository-extraction.md), [native plan](arya-1.1-native-plan.md), and [1.1 native publication](native-release-verification.md).

Historical plans and versioned release records describe their own dates and versions. Their hashes, test counts, and old registry tags remain evidence; use the current guides for installation.
