# Arya Secure format specification

**Revision 1 — unreleased source candidate.** This document specifies Arya's scrypt password format and AES-256-GCM envelope versions 1 and 2. These are application formats over established cryptographic primitives. See the [API guide](security-library.md), [implementation](../src/std/security.ts), [public vectors](../fixtures/security/arya-secure-v1.json), and [vector reference implementations](../fixtures/security/README.md). The formats have automated interoperability coverage and have not received an independent security audit.

## Common encoding

Delimiters and algorithm/version names are case-sensitive ASCII. `$` separates fields. No extra fields or whitespace are allowed. Binary fields use the RFC 4648 URL-safe alphabet `A–Z a–z 0–9 - _`, with no padding. A decoder must reject noncanonical encodings, including nonzero unused trailing bits. Base64url of zero bytes is the empty string. Text is UTF-8 without automatic normalization or trimming.

Password and plaintext strings follow Node's UTF-8 encoding, including replacement of unpaired UTF-16 surrogates with U+FFFD. Account/purpose context must instead reject unpaired surrogates. Bounds are measured in UTF-8 bytes, with early string-length checks to bound allocation. Passwords contain 1–1024 bytes; plaintext/messages contain 0–1048576 bytes.

## Password hashes

```text
arya$scrypt$v1$<N>$8$1$<salt>$<derived-key>
```

| Field | Contract |
| --- | --- |
| `N` | Exactly `16384`, `32768`, `65536`, `131072`, or `262144`; decimal ASCII without leading zeros. |
| `8`, `1` | scrypt parameters `r=8`, `p=1`. |
| `salt` | Canonical base64url of exactly 16 bytes; 22 characters. |
| `derived-key` | Canonical base64url of exactly 32 bytes; 43 characters. |

Compute scrypt over UTF-8 password bytes and decoded salt with the stated parameters and `dkLen=32`. New hashes generate a fresh cryptographically random salt. Compare derived keys with a timing-safe byte comparison. Encoded inputs over 100 characters are invalid.

Creation profiles are `standard` (`N=131072`) and `strong` (`N=262144`). Lower accepted costs are verification-only migration profiles; writers must never create them through the public API. Readers must reject all other costs and versions before deriving. The implementation caps each derivation at `128*N*r + 16*1024*1024` bytes of permitted memory. Parameters cannot choose unbounded CPU/memory work.

Upgrade policy compares costs within this supported scrypt format: upgrade only when stored `N` is below target `N`. A successful upgrade creates a fresh salt. `verifyPasswordAndUpgrade` verifies before deriving a replacement and returns `{ok:true, upgraded:true, hash:<replacement>}`. Successful current/stronger hashes return `{ok:true, upgraded:false, hash:<original>}`. Failed verification returns `{ok:false, upgraded:false, hash:null}`. Invalid input types/options and resource failures reject. The caller persists a replacement atomically against the original value; no storage mutation is part of this format.

## AES-256-GCM envelope v1

```text
arya$aes256gcm$v1$<nonce>$<tag>$<ciphertext>
```

Use a 32-byte AES key, a fresh cryptographically random 12-byte nonce, and a 16-byte GCM tag. Ciphertext has the same byte length as the UTF-8 plaintext. No additional authenticated data is supplied. Nonce/tag/ciphertext are base64url fields; an empty ciphertext is valid. Reject envelopes over 1398200 characters, noncanonical fields, incorrect nonce/tag lengths, or ciphertext over 1048576 decoded bytes. The single-key API preserves this compatibility format.

## AES-256-GCM envelope v2

```text
arya$aes256gcm$v2$<key-id>$<nonce>$<tag>$<ciphertext>
```

Cryptographic sizes match v1. The key ID must match `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`. Reject envelopes over 1398400 characters before parsing, incorrect field counts/encodings, or ciphertext over 1048576 bytes. Select exactly the retained key matching the ID; do not try alternative keys or fall back to v1.

The caller supplies expected `account` (1–256 UTF-8 bytes) and `purpose` (1–128 UTF-8 bytes) outside the envelope. They must be well-formed Unicode strings. Define `LP(text)` as the unsigned 32-bit big-endian length of UTF-8 text in bytes, immediately followed by those bytes. The exact GCM additional authenticated data (AAD) is:

```text
ASCII("arya$aes256gcm$v2$")
  || LP(key-id)
  || LP(account)
  || LP(purpose)
```

`||` means byte concatenation. The prefix includes its trailing `$`; the length-prefixed values have no extra delimiter. Set AAD before processing plaintext/ciphertext. The length prefixes prevent ambiguities such as account/purpose pairs `("ab", "c")` and `("a", "bc")`. Header key IDs and both context values are authenticated. Context is not serialized in the envelope, and implementations must obtain expected context from trusted application state.

Decryptors must authenticate the GCM tag before releasing any plaintext. Unknown key IDs, incorrect key material, authentication failures, malformed envelopes, and unsupported versions map to the same decryption failure. The API uses `ARYA_SECURITY_DECRYPT` and does not include supplied secrets in errors.

## Rotation and compatibility

A keyring is a private snapshot with one active key ID and up to 32 retained keys. Writers always use the active key. Readers use the authenticated envelope key ID. Rotation first decrypts/authenticates with the supplied context, then re-encrypts under the active key with a new random nonce when IDs differ. Already-active envelopes are returned unchanged only after authentication. The caller atomically persists the returned envelope. Key IDs must remain permanently associated with the same material.

Keep old keys available until all relevant records/backups are migrated. Keyring readers accept v2 only. Migrating v1 requires an application-authorized decrypt and v2 encrypt with known ownership/context. Account/purpose binding protects association, and does not prevent replay into the same context. Changing context requires explicit application authorization. Future formats require new version identifiers and explicit dispatch; readers must never silently substitute another version or primitive.

## Reproducing the vectors

The [JSON vectors](../fixtures/security/arya-secure-v1.json) contain public fixed salts, keys, and nonces, including Unicode/empty plaintext cases, both writer password profiles, a migration profile, and exact v2 AAD bytes. Fixed randomness is only for these tests; the production API does not expose salt/nonce overrides. The [generator](../scripts/generate-security-vectors.mjs) uses Node scrypt and Web Crypto AES-GCM. [Runtime tests](../tests/security.test.ts) validate the fixed outputs, tampering, context substitution, rotation, and upgrade behavior. The [Python verifier](../fixtures/security/verify_vectors.py) checks scrypt, AES-GCM, SHA-256, and HMAC independently through Python APIs.
