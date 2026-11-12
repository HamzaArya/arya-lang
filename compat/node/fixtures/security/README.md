# Arya Secure public test vectors

[arya-secure-v1.json](arya-secure-v1.json) is a deterministic interoperability corpus for the [Arya Secure specification](../../docs/arya-secure-format.md). Its revision 1 covers password hashes and AES-GCM envelope versions v1/v2. Every password, key, salt, and nonce here is public test material and must never be used in an application.

The `passwords` records contain UTF-8 password text, scrypt cost, base64url salt, and the exact encoded hash. The `encryption` records contain plaintext, key, nonce, format version, key ID/context where applicable, exact AAD hex, and encoded envelope. The remaining records contain SHA-256 and HMAC-SHA-256 vectors. Use each record independently.

Regenerate the corpus deterministically from the repository root:

```sh
node scripts/generate-security-vectors.mjs
```

`npm test` validates the corpus through Arya's generated runtime and Node crypto. The Python reference verifier additionally needs the [cryptography package](https://cryptography.io/en/latest/hazmat/primitives/aead/); this is optional test tooling, and is not an Arya runtime dependency. Use an isolated environment:

```sh
python3 -m venv .build/security-reference
.build/security-reference/bin/python -m pip install cryptography
.build/security-reference/bin/python fixtures/security/verify_vectors.py
```

On Windows, use `.build/security-reference/Scripts/python.exe` for the last two commands. The verifier resolves its JSON fixture relative to its own file and can run from another working directory. The Python reference checks scrypt via `hashlib`, AES-256-GCM via `AESGCM`, and SHA/HMAC via the standard library. Regeneration does not provide a new security audit; existing fixed outputs are regression evidence and must be reviewed if changed.
