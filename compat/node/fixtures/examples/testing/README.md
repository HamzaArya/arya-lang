# Testing example

Requires the **unreleased source candidate** and Node.js 22.15+. No extra packages are needed.

From the repository root:

```sh
npm run build
node dist/cli.cjs check fixtures/examples/testing/main.test.arya
node dist/cli.cjs test fixtures/examples/testing/main.test.arya
```

Five tests cover an imported invoice module, strict nested comparisons, expected errors, mock calls, authenticated encryption, and asynchronous failures. Hooks reset each test's data. A failing assertion makes the command exit with status 1 and points back to the Arya source.

Read the [testing library guide](../../../docs/testing-library.md) for setup/cleanup, context-scoped mocks, timeouts, skipped tests, and CI usage.
