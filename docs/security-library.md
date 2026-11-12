> Historical implementation guide. The original is preserved in [compat/node/docs/security-library.md](../compat/node/docs/security-library.md). Current native behavior is defined by the [native profile](native-profile.md), [SDK guide](native-sdk.md) and [qualification report](native-independence-report.md).

# Arya Secure: security library

**Unreleased source candidate.** Build this checkout with `npm run build` and use `node dist/cli.cjs`; the published 1.3.0-alpha.9 package does not include this library. Requires Node.js 22.15+, with no additional packages.

```arya
use std "security" as security

const encoded = await security.hashPassword("a long example passphrase")
const accepted = await security.verifyPassword("a long example passphrase", encoded)
print(accepted)
```

Arya Secure provides Arya's versioned formats, defaults, and upgrade path over Node's crypto primitives. Importing or checking code does not generate keys or hash passwords. See the [format specification and vectors](arya-secure-format.md), [runnable example](../fixtures/examples/security/README.md), and [automated tests](../tests/security.test.ts).

## Passwords

| Call | Result |
| --- | --- |
| `await security.hashPassword(password, options = {})` | A versioned scrypt hash with a fresh 16-byte random salt and a 32-byte derived key. Options accept only `profile: "standard"` (default) or `"strong"`. |
| `await security.verifyPassword(password, encoded)` | True for a matching password; false for mismatches, malformed hashes, or unsupported format/parameters. |
| `security.passwordNeedsUpgrade(encoded, options = {})` | True if the hash has a lower cost than the target profile or is malformed/unsupported. This metadata check never authenticates a login. Stronger hashes return false. |
| `await security.verifyPasswordAndUpgrade(password, encoded, options = {})` | Verify first, then return `{ok, upgraded, hash}`. Failed verification returns `{ok: false, upgraded: false, hash: null}`. Successful verification returns the original hash or a freshly salted upgrade. |

Passwords must contain 1–1024 UTF-8 bytes. Whitespace and null characters are preserved; text is neither normalized nor truncated. Invalid password inputs and non-text hash arguments reject with `ARYA_SECURITY_INPUT`. Crypto/resource errors propagate as rejections.

The stored format is `arya$scrypt$v1$<N>$8$1$<salt>$<derived-key>`, with canonical unpadded base64url fields. The standard profile uses `N=131072`; strong uses `N=262144`. Verification also accepts `N=16384`, `32768`, or `65536` solely to migrate older/imported low-cost records. New hashes never use those weaker costs. All other parameters/versions are rejected before derivation. Store the entire encoded string; migrate non-Arya formats explicitly.

The standard profile follows an [OWASP scrypt configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Derivation needs about 128 MiB for standard or 256 MiB for strong, with an API memory ceiling of estimated memory plus 16 MiB. Work runs in [Node's crypto thread pool](https://nodejs.org/download/release/v22.15.0/docs/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Bound application concurrency and rate limit authentication attempts. Missing or malformed stored hashes return early; this function does not make an entire login flow constant time or prevent account enumeration.

```arya
use std "security" as security

export async fn checkLogin(password, storedHash) {
  const result = await security.verifyPasswordAndUpgrade(password, storedHash)
  if result.ok and result.upgraded {
    # Persist result.hash only if the database still contains storedHash.
    # This compare-and-swap avoids overwriting a concurrent password reset.
  }
  return result
}
```

Use `{profile: "strong"}` to request the stronger policy. Upgrades only increase cost. Current or stronger hashes are returned unchanged, so already-upgraded records do not churn. The helper returns a replacement for your application to persist; it performs no database writes. Failed upgrade derivation rejects the operation without returning a replacement. An unsupported hash needs an explicit migration or password reset.

Use `hashPassword` for password storage. `hash` is a fast checksum and is unsuitable for storing passwords. Keep passwords and hashes out of logs and apply your application's password policy before calling the library.

## Tokens, keys, and digests

| Call | Result |
| --- | --- |
| `security.randomToken(bytes = 32)` | Unpadded base64url token with `bytes` of cryptographic randomness; integer sizes 16–1024. The default is 43 characters. |
| `security.uuid()` | Random UUID v4 identifier. |
| `security.generateKey()` | Canonical base64url encoding of 32 random bytes, suitable for the encryption and HMAC methods. |
| `security.hash(text)` | Lowercase 64-character SHA-256 digest of UTF-8 text. |
| `security.hmac(key, text)` | Lowercase hex HMAC-SHA-256 using the decoded 32-byte key. |
| `security.verifyHmac(key, text, signature)` | Verify a lowercase hex signature; malformed/mismatched signatures return false. Invalid keys/messages throw. |
| `security.timingSafeEqual(left, right)` | Compare UTF-8 text through Node's timing-safe comparison when byte lengths match; otherwise return false. |

Messages and comparison inputs are limited to 1 MiB of UTF-8 text. Empty messages are allowed. HMAC and encryption keys must be canonical unpadded base64url strings encoding exactly 32 bytes; ordinary passphrases and padded base64 keys are rejected with `ARYA_SECURITY_KEY`. Input size/type errors use `ARYA_SECURITY_INPUT`. Error messages do not include supplied secrets.

```arya
use std "security" as security

const key = security.generateKey()
const body = "account:42"
const signature = security.hmac(key, body)
print(security.verifyHmac(key, body, signature))
```

Compare the original signed bytes: parsing and reserializing JSON can change a signature. HMAC provides authentication; it does not hide a message or implement expiration/replay prevention. Add those controls in your protocol. `timingSafeEqual` exposes length differences and, like [Node's primitive](https://nodejs.org/download/release/v22.15.0/docs/api/crypto.html#cryptotimingsafeequala-b), does not guarantee that surrounding application code is timing safe.

## Credentials, key rotation, and context binding

```arya
use std "security" as security
use std "env" as env

# Provision each key once, then retain it in a secret-management system.
const vault = security.keyring({
  active: "key-2026-11",
  keys: {
    "key-2026-10": env.require("ARYA_PREVIOUS_KEY"),
    "key-2026-11": env.require("ARYA_CURRENT_KEY")
  }
})
const context = {account: "tenant:1/user:42", purpose: "oauth:github"}
const encrypted = vault.encrypt("Private credential", context)
const original = vault.decrypt(encrypted, context)
const replacement = vault.rotate(encrypted, context)
```

| Call | Result |
| --- | --- |
| `security.keyring({active, keys})` | Create a frozen keyring with a private snapshot of 1–32 named keys. `active` must identify one of the keys. |
| `vault.encrypt(text, {account, purpose})` | Encrypt up to 1 MiB of UTF-8 text with the active key, AES-256-GCM, a fresh 12-byte random nonce, and a 16-byte tag. Authenticate the key ID and supplied context. |
| `vault.decrypt(encoded, {account, purpose})` | Decrypt using the envelope's retained key, after authenticating the ciphertext, header, and expected context. |
| `vault.rotate(encoded, {account, purpose})` | Authenticate first. Return `{encrypted, rotated}`; re-encrypt with the active key and a fresh nonce if the source key ID is older. An already-current envelope is returned unchanged after authentication. |

The v2 envelope is `arya$aes256gcm$v2$<key-id>$<nonce>$<tag>$<ciphertext>`. Key IDs are public metadata: 1–64 ASCII characters, starting with a letter/digit, followed by letters/digits/hyphens/underscores. Keys use the same canonical encoding as `generateKey()`. Configuration and context must be plain records without accessors or unknown fields. Editing the input configuration after construction does not change the keyring; construct a new one to change the active key.

Context is required for every keyring operation. `account` contains 1–256 UTF-8 bytes; `purpose` contains 1–128. Context strings must be well-formed Unicode and are not normalized. Context is authenticated as length-prefixed bytes, and is not stored in the envelope. Supply the expected account/purpose from trusted application state: fetching an account identifier from the same untrusted ciphertext record defeats the intended binding. A different account, purpose, or substituted key ID fails authentication even if two IDs happen to contain the same key material.

Decrypt/rotate failures for wrong keys, unknown IDs, tampering, malformed/oversized envelopes, or unsupported versions use the same `ARYA_SECURITY_DECRYPT` error. Invalid configuration/key encoding uses `ARYA_SECURITY_INPUT` or `ARYA_SECURITY_KEY`; missing/invalid context uses `ARYA_SECURITY_INPUT`. No unauthenticated plaintext is returned. The library uses [Node's authenticated cipher APIs](https://nodejs.org/download/release/v22.15.0/docs/api/crypto.html#class-cipher).

To rotate, provision a fresh key under a new immutable ID, make that ID active, retain the previous keys for reads, and call `rotate` as records are read or migrated. Persist `replacement.encrypted` with a compare-and-swap against the original envelope. Retire old keys only after migrating records and accounting for backups. Reusing an old ID with different key material makes its old records unreadable. Rotation under this API preserves account/purpose context; moving a credential to another account/purpose requires an explicitly authorized decrypt/re-encrypt operation. Context binding does not provide replay protection within the same account/purpose.

## Existing single-key encryption

`security.encrypt(key, text)` and `security.decrypt(key, encoded)` retain their original v1 behavior for compatibility. They use AES-256-GCM and the envelope `arya$aes256gcm$v1$<nonce>$<tag>$<ciphertext>`, with no key ID or account/purpose binding. A v1 envelope cannot be opened by a keyring, and the single-key API cannot open v2. There is no automatic fallback that could bypass context authentication.

To migrate v1, establish the record's ownership in your application, decrypt with the known v1 key, encrypt through the keyring with trusted context, and persist the v2 replacement. Empty plaintext is supported by both formats. No envelope contains a key.

Retain keys separately from ciphertext using your secret-management system; restarting with a new key prevents decrypting old data. Use separate keys for encryption and HMAC, identify key versions in your application records, and plan rotation. JavaScript strings cannot be reliably erased from memory. This library provides primitives; authentication sessions, authorization, HTTPS, CSRF protection, and key management remain application responsibilities.
