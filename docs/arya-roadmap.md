# Arya roadmap

Arya focuses on readable Node.js applications that connect JavaScript/npm and Python. The current source candidate is **1.3.0-alpha.12**, with [candidate notes](releases/1.3.0-alpha.12.md). The current published preview is **1.3.0-alpha.9** on `next`; the publication record retains **1.2.0-alpha.4** on `latest`. An alpha version remains experimental even when its numeric prefix is 1.x. The [stable release plan](stable-release-plan.md) tracks the next compatibility and qualification work; unreleased source changes require new artifacts.

Use [release readiness](release-readiness.md) for version-specific verification and [compatibility policy](compatibility-policy.md) for release promises. This roadmap distinguishes implemented features from work that still needs evidence; it does not set release dates.

## Implemented in the current source

| Area | Available behavior | Reference |
| --- | --- | --- |
| Canonical syntax | One spelling for declarations, functions, branches, iteration, and output; earlier aliases removed | [Migration](syntax-migration.md); changed in 1.3.0-alpha.4 |
| Language and modules | Lexical checks, closures, async functions, contained module graphs, live exports, and mapped runtime errors | [Specification](arya-specification.md), [compiler API](compiler-api.md) |
| Application flow | Pipelines, concise/default/rest functions, spreads, terminating guards, indexed loops, finally cleanup, and list helpers | [Flow syntax](flow-syntax.md); added in 1.3.0-alpha.2 |
| Ecosystem integration | Native JavaScript values, synchronous Python calls, opt-in async calls/batches, bounded clients, and cancellation | [Interop](interop.md), [async Python](python-async.md) |
| Servers and databases | HTML/assets, JSON and parameter routes, validation, logs, readiness, shutdown, and MySQL pools/transactions | [Web](arya-web.md), [services](services.md), [MySQL](mysql.md) |
| UI and desktop | Components, browser state/forms/actions, motion, and an Electron starter | [UI applications](ui-apps.md), [library](ui-library.md) |
| UI composition | Ten additional components, eight page sections, and four complete templates | [Sections/templates](ui-patterns.md); added in 1.3.0-alpha.3 |
| Project and editor tools | Five starters, bundled VSIX/icons/themes, passive language services, member hints, Quick Fixes, and portable adapters | [Creator](project-creator.md), [editor setup](editor-setup.md) |
| Distribution | Bundled npm archives, deterministic editor archives, clean-snapshot verification, and a read-only release audit | [Release process](releasing.md) |

The 1.3 source line retired native compilation in alpha.1. Native APIs, libraries, bootstrap tools, and project templates are historical work; [migration](node-runtime.md) gives current replacements. Published older packages retain their original behavior.

## Native and financial modernization

The [architecture audit and gap analysis](architecture-audit.md), [target architecture](architecture-target.md), and [staged implementation roadmap](implementation-roadmap.md) translate the [master requirements](arya-master-plan.md) into verified milestones. Alpha.11 adds a bounded exact accounting library and optional native kernel through the existing JavaScript boundary. Alpha.12 adds verified typed IR and independent native executables for a bounded scalar subset. Broader native coverage, currency-registry money types, C/Python native bindings and financial packages remain future work.

## Next qualification work

| Work | Completion evidence |
| --- | --- |
| Qualify the current revision on Linux and Windows | Successful compiler/package CI jobs for that exact revision, with retained logs and runtime identities. Prior-version CI results do not qualify this candidate. |
| Qualify additional desktop/editor/platform combinations | Real application runs on each claimed OS/architecture and editor version; supplied adapters alone are insufficient. |
| Recheck optional integrations when affected | Disposable live MySQL, real Chrome, Electron, and editor-host checks, with explicit skips. See [contributing](../CONTRIBUTING.md). |
| Run external learner sessions | Real attempts at installation, the tutorial, modules, interop, and error diagnosis; record failures and assistance through [community review](community-review.md). |
| Select further tooling from evidence | A reproduced engineering problem or actual learner observation, the smallest remedy, a compatibility assessment, and an observable acceptance case in [tooling decisions](tooling-evidence.md). |
| Qualify a stable release | A versioned stable contract, maintained support policy, reproducible artifacts, tested platform matrix, and learner findings. No stable release or maintenance branch is declared. |

Publishing the source candidate is a separate maintainer operation using reviewed archives. Source commits and documentation edits do not publish packages, move npm tags, upgrade AryaCode's embedded compiler, or publish editor marketplace extensions.

## Deferred work and known limits

- The [business candidate](business-applications.md) implements conservative formatting, bounded recovery, snapshot references/rename/signatures, incremental builds and optional types. The unreleased [editor/compiler improvements](editor-and-compiler-improvements.md) add closed-file discovery, incremental analysis and static namespace rename. Local VS Code and AryaCode host checks cover applied rename, unsaved/disk updates and Node breakpoint/step behavior. AryaCode needs a Node adapter in its test profile. Other platforms/editors and richer analysis remain qualification or future work.
- Python clients manage fresh child processes; persistent cross-call Python state, callback transport, and live Python objects are outside the current bridge.
- Advanced type analysis, Unicode identifiers/bidirectional editor support, direct bridges to other runtimes, and an Arya package registry are proposals rather than available features. Dari/Pashto learning material needs fluent review separately from identifier syntax.
- Electron installers, signing, notarization, and automatic updates need application distribution work beyond `arya build`.
- Runtime helper isolation is fixed in alpha.5; mutating actual host objects still follows JavaScript semantics.

## Decisions and history

The [archived milestone roadmap](history/roadmap-through-1.3.0-alpha.3.md) retains M0–M9, decisions D-001–D-016, dated progress notes, and their original evidence. Those historical checkboxes are not the current release checklist. The [history index](history/README.md) also preserves the 0.1 audit, extraction inventory, initial plan, and retired native documents. Versioned behavior and migration decisions remain in the [changelog](../CHANGELOG.md) and [release notes](releases/README.md).
