# Retained Node compatibility

The primary Arya toolchain is native. The previous 1.3 Node implementation, npm scripts and JavaScript editor backend are preserved under [compat/node](../compat/node/README.md), including a byte-preservation inventory. Native builds do not load or invoke that implementation.

Existing Arya Ledger installations, pinned packages and data are unchanged. Applications that currently import JavaScript/compiler packages keep that integration until they deliberately migrate. The [native financial worker](../native/examples/calculation-worker.arya) permits opt-in exact calculations through JSON lines. It is not an automatic application or database migration.

The original runtime guide is preserved at [compat/node/docs/node-runtime.md](../compat/node/docs/node-runtime.md). Current native behavior and foreign boundaries are in the [native profile](native-profile.md).
