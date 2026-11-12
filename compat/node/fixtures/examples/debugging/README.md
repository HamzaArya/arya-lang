# Readable expressions and debugging

This example requires Arya 1.2.0-alpha.4 or later. From the repository root:

```sh
npm run build
node dist/cli.cjs check fixtures/examples/debugging/main.arya
node dist/cli.cjs run fixtures/examples/debugging/main.arya
```

The example preserves a false preference with `??`, reads nested data with `?.`, formats a list through a multiline chain, checks an assumption, and traces a value to stderr with its original source location.

To see a code frame and a Quick Fix, change `customer.name` to `custmoer.name` and run Check or open the file in the portable extension. Restore the spelling to fix it. Machine-readable reporting is available with `node dist/cli.cjs check fixtures/examples/debugging/main.arya --json`.

See the [syntax and debugging guide](../../../docs/syntax-and-debugging.md).
