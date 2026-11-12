# Security example

Requires the **unreleased source candidate** and Node.js 22.15+. No extra packages are needed.

From the repository root:

```sh
npm run build
node dist/cli.cjs check fixtures/examples/security/main.arya
node dist/cli.cjs run fixtures/examples/security/main.arya
```

The example demonstrates login-time password upgrades, key rotation, account/purpose binding, HMAC verification, and random tokens. It prints verification results without printing passwords, hashes, keys, or tokens. Keys are temporary for this demo; applications must retain encryption keys separately from encrypted data and persist replacement hashes/envelopes in their own database.

Read the [security API](../../../docs/security-library.md), [Arya Secure format specification](../../../docs/arya-secure-format.md), and [public vectors](../../security/arya-secure-v1.json). Password hashing uses about 128 MiB per standard operation or 256 MiB for the strong profile; keep login attempts rate limited and bound application concurrency.
