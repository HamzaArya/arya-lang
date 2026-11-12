# Native independence

The primary compiler, runtime, standard libraries and language services use Arya/C ahead-of-time compilation. Build the SDK with `make native-editor`; use `bin/arya` in the checkout or the installed SDK's `arya` executable. No Node/npm or Python interpreter participates in core builds or execution. Explicit foreign interoperability retains its own external dependency.

The [SDK guide](native-sdk.md), [native profile](native-profile.md), [library inventory](standard-library.md) and [qualification report](native-independence-report.md) define the current contract. The historical 2.0.0-alpha.1 artifacts remain immutable and describe the earlier compiler-core milestone. Current source qualification covers the expanded standard library, accounting and native developer tools.

The C seed compiles the self-hosted frontend. Stage one is explicitly rebased onto the current C runtime before building stage two and three; generated stage-two/stage-three C must compare equal. Dependency sources and current seed hashes are recorded in `native/PROVENANCE.json`. `make native-clean-test` copies only native source inputs into a fresh workspace and removes Node/Python from the executable search path before building and testing the complete SDK.

The previous Node implementation is retained in [compat/node](../compat/node/README.md). It is outside the primary build and exists to preserve existing consumers and original work. This conversion does not install system software, upgrade Ledger packages or migrate data.
