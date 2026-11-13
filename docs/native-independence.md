# Native independence

The primary compiler, runtime, standard libraries and language services use Arya/C ahead-of-time compilation. Build the SDK with `make native-sdk`; use `bin/arya` in the checkout or the installed SDK's `arya` executable. No Node/npm or Python interpreter participates in core builds or execution. Explicit foreign interoperability retains its own external dependencies.

The [SDK guide](native-sdk.md), [native profile](native-profile.md) and [library inventory](standard-library.md) define current usage and supported behavior. The [original migration qualification](native-independence-report.md) and subsequent [runtime](native-fastpaths.md) and [Ledger](native-ledger-fastpaths.md) reports identify their tested snapshots. Their hashes and measurements remain historical evidence when source changes.

The C seed compiles the self-hosted frontend. Stage one is rebased onto the current C runtime before building stages two and three; generated stage-two/stage-three C must compare equal. Dependency sources and seed hashes are recorded in `native/PROVENANCE.json`. `make native-clean-test` copies native source inputs into a fresh workspace and excludes Node/Python from the executable search path before building and testing the SDK.

The optional editor adapter is built separately with `make native-editor`; its editor host supplies its JavaScript environment. That adapter is excluded from the standalone SDK. Native checking, formatting, language services and generated programs do not require it.

The previous Node implementation is retained in [compat/node](../compat/node/README.md) for existing consumers and provenance. It does not participate in native builds. Building the language does not select a new Ledger worker or migrate application data; host integrations choose their explicit executable and dependencies.
