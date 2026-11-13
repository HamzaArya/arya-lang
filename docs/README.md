# Arya documentation

These guides describe the standalone native compiler, runtime and libraries. Start with installation and a working program; implementation reports record the particular versions and machines they tested.

## Start here

| Goal | Guide |
| --- | --- |
| Install on another computer or upgrade an SDK | [Installation and platforms](installing.md) |
| Create, run, check and build a first application | [Getting started](getting-started.md) |
| Learn the language and its supported syntax | [Language reference](arya-language.md) |
| Review the latest syntax changes and their verification | [Syntax update](native-syntax.md) |
| Find commands and build options | [CLI reference](cli.md) |
| Understand SDK layout and linking | [Native SDK](native-sdk.md) |
| Compare supported behavior with JavaScript | [Native language profile and limits](native-profile.md) |

## Libraries and examples

| Task | Documentation | Example |
| --- | --- | --- |
| Find a module or API | [Standard library](standard-library.md) | [Native examples](../native/examples/) |
| Exact money, balanced transactions and reports | [Accounting](accounting-engine.md) | [Journal report](../native/examples/journal-report.arya) |
| Parsed decimals, Money, finance policies and streaming CSV | [Values and data processing](native-finance-data.md) | [Streaming ledger](../native/examples/stream-ledger.arya) |
| Validate input, use cryptography and diagnose failures | [Security and debugging](native-security-debugging.md) | [Secure service](../native/examples/secure-service.arya) |
| Authenticate with passwords, MFA, sessions and native biometrics | [Authentication](native-auth.md) | [Auth API](../native/examples/auth-service.arya), [Local unlock](../native/examples/auth-local.arya) |
| Connect a host application to a standalone worker | [SDK interoperability](native-sdk.md) | [Calculation worker](../native/examples/calculation-worker.arya) |

## Compiler and project development

- [Compiler interface](compiler-api.md): CLI and native language-server boundaries.
- [Native independence](native-independence.md): bootstrap and runtime dependencies.
- [Contributing](../CONTRIBUTING.md): source layout, regression checks and optional integration gates.
- [Current engineering status](tasks/native-professionalization.md): implemented work and remaining acceptance criteria.
- [Learner review kit](native-learner-review.md): prepared exercises; no completed participant study is claimed.

## Performance and qualification evidence

Measurements apply to their recorded sources, binaries, workload boundaries and hosts. A newer syntax or documentation change does not automatically requalify an older performance result.

- [Ledger workload comparison](native-ledger-fastpaths.md): aging, allocations, reports and production; full results and tradeoffs.
- [Runtime optimization report](native-fastpaths.md): allocation, numeric dispatch, exact formatting and native JSON scanning.
- [Native data performance](native-data-performance.md): data paths, batching and representative workloads.
- [Engineering audit](native-professionalization.md): accounting, validation, diagnostics, dependency and packaging work.
- [Original native qualification](native-independence-report.md): the recorded migration baseline, not a live support matrix.

The compiler/runtime reports link their focused experiments and raw evidence. Use the [native profile](native-profile.md) for current supported behavior and [installation guide](installing.md) for qualified platforms.

Maintainers can run the optional offline documentation check with `python3 native/tests/docs-reference.py`. It verifies current local links, heading anchors and the library inventory against `native/manifest.json`; `--sdk <directory>` also checks an extracted SDK. Python is not required to build or run Arya.

## Historical material

The retained JavaScript/Node implementation and its original guides live in [compat/node](../compat/node/README.md). Its npm packages and editor versions are separate from the native SDK. Duplicate Node-profile guides have been removed from this directory; [the cleanup record](maintenance/cleanup-2026-11-13.json) identifies their preserved originals.

[Historical plans](history/README.md) and [release records](releases/README.md) remain available for provenance. Their commands, registry tags and feature statements describe their recorded versions, not current native installation instructions.
