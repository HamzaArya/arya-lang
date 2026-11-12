# Native compiler interface

The native SDK exposes the `arya` CLI and `arya lsp --stdio`. See [CLI commands](cli.md), [SDK usage](native-sdk.md), and the [language profile](native-profile.md). Analysis constructs syntax/type data and never executes imported project code.

The frontend is written in Arya under `native/compiler`. It emits C11 and invokes a native C compiler for application builds. Generated `.c` and `.NOTICE` files accompany executable outputs. The source compiler bootstraps from a retained C seed and verifies stage-two/stage-three generated-C convergence.

A stable public C embedding ABI and generated native declaration packages are separate ecosystem work. The older TypeScript/JavaScript compiler API is preserved at [compat/node/docs/compiler-api.md](../compat/node/docs/compiler-api.md) with its implementation. Native consumers should invoke the CLI/LSP or an explicitly documented application protocol such as the financial worker.
