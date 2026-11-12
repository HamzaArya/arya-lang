# Accounting calculation example

Requires the unpublished alpha.11 source candidate. The [accounting guide](../../../docs/accounting-engine.md)
explains the exact policy, optional native kernel, limits and portable fallback.
From the built repository run:

```sh
node dist/cli.cjs run fixtures/examples/accounting/main.arya
```

It prints `42.89` and `true 0.00`. A packaged application may use the much smaller
standalone `arya-accounting` runtime package through ordinary JavaScript interop.
No database, Python interpreter or compiler is needed by that runtime package.
Building the optional native binary requires a C++ compiler and Node SDK headers;
JavaScript execution works without them.
