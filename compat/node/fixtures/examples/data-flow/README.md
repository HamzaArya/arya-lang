# Readable data pipelines

Added in 1.3.0-alpha.2; use the current **1.3.0-alpha.4 source candidate** or its matching archive. The published 1.2.0-alpha.4 package does not include this syntax or the `list` library.

From the repository root:

```sh
npm ci
npm run build
node dist/cli.cjs run fixtures/examples/data-flow/main.arya
```

Expected output:

```text
1. Samira
2. Hamza
Total score: 180
```

The program uses an early guard, an expression-bodied function with a default parameter, input-first list pipelines, and indexed iteration. It filters and ranks records without changing the original list.

With Python installed, run `node dist/cli.cjs run fixtures/examples/data-flow/python.arya`. Its output is `Python average: 20.0`. An explicit awaited pipeline calls a bound Python function, then formats the result with an Arya function. No third-party packages are required.

See the [syntax guide](../../../docs/flow-syntax.md) for defaults/rest parameters, spreads, pipeline evaluation order, `finally` cleanup, errors, and the complete list API.
