# Native authentication

`use std "auth" as auth` provides password authentication, opaque bearer
sessions, one-use challenges, TOTP MFA, recovery codes, OAuth PKCE, attempt
limits and native local authentication. Cryptographic operations use the
existing OpenSSL backend. macOS integrates LocalAuthentication and Keychain
Services directly through Objective-C and C; no shell command, JavaScript
engine, Node service or Python bridge participates in authentication.

Build with `make native-sdk`. On macOS, `make native-auth` builds the native
adapter separately. Importing `auth` selects the crypto dependency and, on
macOS, Foundation, LocalAuthentication and Security frameworks. Programs that
do not import it do not link that adapter. The module is additive; existing
`security` APIs and wire formats remain supported.

## Password login and sessions

```arya
use std "auth" as auth
const sessions = auth.sessions({ttlSeconds: 900, maxSessions: 4096})
const attempts = auth.rateLimiter({maxAttempts: 5, windowSeconds: 300})

# Inside a login handler; account and storedHash come from your account store.
if not attempts.attempt(account.id).allowed { throw "Try again later" }
const checked = await auth.verifyPasswordAndUpgrade(input.password, storedHash)
if not checked.ok { throw "Invalid credentials" }
# Persist checked.hash when checked.upgraded, before completing the login.
# When MFA is enabled, verify and atomically accept that factor first.
const issued = sessions.issue(account.id, {methods: ["password"]})
# Deliver issued.token over HTTPS; retain only its digest inside this store.
```

`hashPassword(password, {profile?})`, `verifyPassword(password, encoded)`,
`verifyPasswordAndUpgrade(password, encoded, {profile?})` and
`passwordNeedsUpgrade(encoded, {profile?})` preserve the [security library's
scrypt profiles, limits and encodings](native-security-debugging.md#use-established-cryptography).
The first three run on bounded native workers. Passwords retain their exact
UTF-8 bytes, including whitespace and embedded NUL. Standard scrypt work factors
are preserved; session speed improvements do not weaken password hashing.

`sessions({ttlSeconds?, maxSessions?})` creates a process-local opaque store.
TTL defaults to 3600 seconds, range 1–2592000. Capacity defaults to 4096, range
1–65536. Its frozen methods are:

| Method | Result |
| --- | --- |
| `issue(subject, {methods?})` | `{token, session}`; token contains 32 random bytes encoded as 43 canonical base64url characters |
| `verify(token)` | Frozen session snapshot, or `null` for invalid, expired or revoked tokens |
| `consume(token)` | Snapshot and immediate revocation, or `null`; a token succeeds once |
| `rotate(token)` | New `{token, session}` and immediate invalidation of the old token, or `null` |
| `revoke(token)` | Whether an entry was removed |
| `revokeAll(subject)` | Number of entries removed for that exact subject |
| `sweep()` | Remove expired entries and return their count |
| `stats()` | `{active, maxSessions}` after expiration cleanup |
| `close()` | Release and clear native storage; repeated close is safe |

A snapshot contains `subject`, `issuedAt`, `expiresAt` and a frozen `methods`
list. Public timestamps are Unix seconds; enforcement uses monotonic deadlines
to resist wall-clock adjustments. Rotation preserves the original issue time,
absolute expiration and methods. Verify and rotate never extend a login.
Capacity exhaustion raises `ARYA_AUTH_CAPACITY` and preserves live sessions.
Issuance cleans up expired entries when their next deadline arrives; explicit
`sweep` can also be scheduled by the application.

Subjects are 1–256 UTF-8 bytes of well-formed Unicode without control characters.
Methods default to an empty list and accept at most eight distinct lowercase
ASCII names of 1–32 characters, using letters, digits and hyphens. They describe
checks your trusted application completed; never copy them from request data.
`requireMethods(session, ["password", "totp"])` returns the supplied snapshot
or throws `ARYA_AUTH_REQUIRED`. It is intended for verified store results.

`bearer(header)` accepts one case-insensitive Bearer scheme, one space and one
RFC 6750 token, bounded to 4096 header characters. Malformed/multiple values
return `null`. It extracts a credential; `sessions.verify` authenticates it.
For cookies, the application must set Secure/HttpOnly/SameSite appropriately
and supply CSRF protection for its browser flow. This library does not set
transport or cookie policy on your behalf.

## TOTP and recovery

```arya
const secret = auth.generateTotpSecret()
const uri = auth.totpUri(secret, {issuer: "Arya App", account: "user@example.com"})
# Provision secret once through a protected channel; render uri as a QR code.
# Enable MFA only after the user successfully proves possession.

const result = auth.verifyTotp(storedSecret, input.code, {lastCounter: account.lastTotpCounter})
if not result.ok { throw "Invalid credentials" }
# Atomically replace lastTotpCounter only when it still equals the value read.
# Only the winning transaction may complete authentication.
```

TOTP follows [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238.html), using
OpenSSL HMAC and the Unix epoch. `generateTotpSecret(bytes?)` defaults to 20
random bytes; 20–64 bytes are allowed. Secrets use canonical uppercase unpadded
Base32. `totpCode(secret, options?)` generates a code. `verifyTotp(secret, code,
options?)` returns `{ok, counter}`, with `counter: null` on failure. Options:

| Option | Default and bounds |
| --- | --- |
| `algorithm` | `SHA1`; also `SHA256`, `SHA512` |
| `digits` | 6; also 8 |
| `period` | 30 seconds; integer 15–120 |
| `time` | Current Unix seconds; integer 0–253402300799, useful for vectors |
| `window` | 1 adjacent step each side; integer 0–2 |
| `lastCounter` | -1; reject counters less than or equal to the stored accepted counter |

Verification compares the complete bounded window, uses constant-time code
comparisons and preserves leading zeros. The default verification is stateless.
Persist and atomically advance `lastCounter` to enforce replay prevention across
requests, processes and restarts. Apply attempt limits before checking a code.
`totpUri(secret, {issuer, account, algorithm?, digits?, period?})` produces an
encoded `otpauth://` enrollment URI. Issuer/account must be nonempty and cannot
contain a colon. Protect the secret and URI as credentials.

`recoveryCodes({count?})` returns frozen `{codes, hashes}` lists. Count defaults
to 10, range 1–20. Each code contains 128 random bits. Show codes once and persist
only hashes; hashes include the `arya$recovery$v1$` domain prefix before SHA-256.
`consumeRecoveryCode(code, hashes)` scans the full bounded list and returns
`{ok, hashes}` with matched hashes removed. It leaves the input list unchanged.
Atomically persist the returned list before completing login. Reusing the old
list would accept a code again. These high-entropy recovery codes are distinct
from short numeric email/SMS codes.

## Challenges, PKCE and attempt limits

`challenges({purpose, ttlSeconds?, maxChallenges?})` creates an isolated one-use
store for password-reset links, email verification, OAuth state or another
application-defined purpose. Default TTL is 600 seconds, range 1–3600; default
capacity is 4096, maximum 65536. Methods are `issue(subject)`, `consume(token)`,
`revoke`, `revokeAll`, `sweep`, `stats`, `close`, with session-store return shapes.
`purpose` is exposed on the frozen object. Use separate stores per purpose;
one store cannot consume a token issued by another. Bind subjects to the correct
account or flow, deliver tokens through the appropriate channel and avoid
account-disclosing responses. Successful consume happens before any await.
Database updates after consume can still fail; issue a new challenge to retry.

`pkce(verifier?)` returns `{verifier, challenge, method: "S256"}` according to
[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html). Omit the verifier for 32
random bytes encoded as base64url, or supply 43–128 unreserved ASCII characters.
Keep the verifier on the initiating client, bind one-use state to that browser
flow, and include a nonce when the chosen identity protocol requires it.
Authorization redirects, provider token exchange, issuer/audience/signature
validation, provider configuration and WebAuthn/passkey verification remain
explicit application integrations; a PKCE challenge alone does not log in a user.

`rateLimiter({maxAttempts?, windowSeconds?, maxEntries?})` charges attempts
synchronously using hashed keys and monotonic fixed windows. Defaults are 5
attempts, 300 seconds and 4096 keys. Bounds are 1–1000 attempts, 1–86400 seconds
and 1–65536 keys. `attempt(key)` returns `{allowed, remaining, retryAfter}`;
blocked attempts do not extend the window. Unknown keys fail closed when a full
store cannot reclaim expired keys. `reset(key)`, `sweep()`, `stats()` and `close()`
complete its API. Reset only according to trusted application policy. These
limits are local to the instance; deploy shared limits for a distributed service.

## Native biometrics and credential storage

```arya
const status = auth.biometricStatus()
const credentials = auth.vault({service: "org.example.app.session", policy: "biometrics"})
# After the server authenticates password + MFA or a federated login:
await credentials.store(accountId, serverSessionToken, "Protect your saved session")
# On a later local unlock, Keychain evaluates its access control:
const token = await credentials.read(accountId, "Unlock your saved session")
# Send token to the server, which still checks expiry and revocation.
```

`biometricStatus({policy?})` performs a noninteractive fresh capability check.
Its frozen result contains `supported`, `available` and the metadata below.
`supported` means a platform adapter exists; `available` reflects current
policy/hardware/enrollment state. Capability can change after a probe.

`await authenticate({reason, policy?, timeoutMs?, signal?, interactive?,
cancelTitle?})` requests an OS policy evaluation. It returns a frozen record
with `ok`, `method` and the following metadata:

| Field | Meaning |
| --- | --- |
| `code` | `ok`, `unavailable`, `not-enrolled`, `locked`, `cancelled`, `denied`, `timeout`, `busy`, `not-interactive`, `missing-entitlement`, `invalid-context` or `platform-error` |
| `detail` | Normalized cause, such as `user-cancelled`, `system-cancelled`, `biometry-lockout`, `passcode-not-set` or `deadline-exceeded`; no raw OS error descriptions |
| `kind` | Available hardware: `touch-id`, `face-id` or `none`; this does not identify the mechanism used by a device-owner evaluation |
| `policy` | Requested `biometrics` or `device-owner` policy |
| `nativeDomain`, `nativeCode` | `LocalAuthentication`/`Security` and its numeric error, or `null` for success and library-generated outcomes |
| `retryable` | A user-initiated retry may help for cancellation, denial, timeout, busy or disallowed interaction; never an instruction to loop prompts automatically |
| `outcomeUnknown` | Always false for evaluation; relevant to vault writes as described below |

Default policy `biometrics` uses
`LAPolicyDeviceOwnerAuthenticationWithBiometrics` with an empty fallback button
title. Explicit `device-owner` allows the OS owner's available mechanisms,
including password/companion fallback. Its returned `method` stays
`device-owner`; success does not prove a particular biometric factor. Each
operation uses a fresh LAContext with reuse duration zero. `reason` is required
user-facing text, 1–256 UTF-8 bytes without control characters. Optional
`cancelTitle` is 1–64 UTF-8 bytes under the same text rules.

`timeoutMs` defaults to 30000, integer range 1–120000. A native `AbortSignal`
from `new AbortController().signal` or `AbortSignal.abort()` cancels the request;
a pre-aborted signal starts no platform operation. Deadlines use monotonic time.
The cooperative event loop checks cancellation/deadlines at intervals of up to
8 ms while runnable; an observed OS completion wins a simultaneous cancellation.
A timeout or abort [invalidates the context](https://developer.apple.com/documentation/localauthentication/lacontext/invalidate()).
`interactive: false` [disallows OS UI](https://developer.apple.com/documentation/localauthentication/lacontext/interactionnotallowed)
and reports `not-interactive` when interaction is required. It does not simulate
a successful check or disable access control.

Only one local authentication or vault operation runs at a time per process.
Concurrent calls return `busy` or throw `ARYA_AUTH_BUSY`. After a timeout/abort,
the caller returns promptly and the gate stays occupied until the OS operation
settles. A late callback cannot release a secret to the cancelled caller. OS
work runs on native dispatch queues, outside the bounded password-hashing
worker pool; polling suspends the Arya task instead of blocking its event loop.
These changes remove worker contention, without changing the OS prompt's own
latency or weakening password hashing.

`vault({service, policy?, timeoutMs?, interactive?, cancelTitle?})` exposes:

| Method | Result |
| --- | --- |
| `store(account, secret, reason, options?)` | Add only; true on success, `ARYA_AUTH_DUPLICATE` if already present |
| `read(account, reason, options?)` | Secret string, or `null` if missing |
| `replace(account, secret, reason, options?)` | True after an authenticated in-place update, false if missing |
| `remove(account, reason, options?)` | True after authenticated deletion, false if missing |

Per-call options accept `timeoutMs`, `signal`, `interactive` and `cancelTitle`.
They override the vault defaults, but cannot change its service or policy.
Service is 1–128 and account is 1–256 UTF-8 bytes under the reason text rules;
secrets are 1–16384 UTF-8 bytes, including embedded NUL and whitespace.
The old reason-string method forms remain supported.

Replace and remove first read through the existing item's access control using
the same fresh context. [Replacement](https://developer.apple.com/documentation/security/secitemupdate(_:_:))
changes only `kSecValueData`; it preserves the existing access control,
accessibility and enrollment binding without a delete/add gap. A normal failed
update leaves the old value intact. Cancellation is cooperative with the OS:
a store, replace or remove already executing can commit after the caller gets
a timeout/cancellation error. Such an error has `outcomeUnknown: true`. Wait
until the busy operation settles, then read/reconcile the credential before
retrying a mutation. Cancellation before mutation starts has
`outcomeUnknown: false`. No API can promise to undo an already committed OS write.

The macOS implementation uses the Data Protection Keychain, device-only
when-unlocked accessibility and no synchronization. Biometric policy requires
`kSecAccessControlBiometryCurrentSet`; changing the enrolled biometric set
invalidates access. Explicit device-owner policy uses `kSecAccessControlUserPresence`.
The two policies have separate credential namespaces, preventing a configuration
switch from reading a weaker item under a stricter policy label. OS identity,
code signing, entitlements, session state and hardware determine availability;
test packaged applications under their actual signing and sandbox configuration.
For Face ID applications, provide the usage description required by Apple.

See Apple's [LocalAuthentication overview](https://developer.apple.com/documentation/localauthentication),
[LAContext API](https://developer.apple.com/documentation/localauthentication/lacontext),
[current biometric set constraint](https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/biometrycurrentset)
and [Keychain accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility).
Arya never receives biometric templates. Local policy success is an OS presence
check; a remote service needs its own verified credential or protocol proof.
Protect secrets with the vault's OS access control instead of relying solely on
an application Boolean. Managed secret strings, including recovered credentials,
are not guaranteed to be erased from every memory copy.

macOS is the implemented native platform. Other hosts report
`supported: false`, `available: false`, and local authentication returns
`{ok: false, code: "unavailable", ...}`. Vault operations throw
`ARYA_AUTH_UNAVAILABLE`. No fallback silently returns success or writes a
plaintext file. Platform support does not expand Arya's qualified release targets.

## Errors, verification and performance

Native auth validates supported options, safe integer limits, Unicode and data
fields before work. Options with accessors reject without invoking them.
Configuration/input errors use `ARYA_AUTH_INPUT`; other module codes are
`ARYA_AUTH_CAPACITY`, `ARYA_AUTH_CLOSED`, `ARYA_AUTH_REQUIRED`, `ARYA_AUTH_CRYPTO`,
`ARYA_AUTH_UNAVAILABLE`, `ARYA_AUTH_NOT_ENROLLED`, `ARYA_AUTH_LOCKED`,
`ARYA_AUTH_CANCELLED`, `ARYA_AUTH_TIMEOUT`, `ARYA_AUTH_BUSY`,
`ARYA_AUTH_NOT_INTERACTIVE`, `ARYA_AUTH_ENTITLEMENT`, `ARYA_AUTH_CONTEXT`,
`ARYA_AUTH_DUPLICATE`, `ARYA_AUTH_DENIED`, `ARYA_AUTH_PLATFORM`. Vault errors
carry `detail`, `kind`, `policy`, `nativeDomain`, `nativeCode`, `retryable` and
`outcomeUnknown`; their `code` remains the `ARYA_AUTH_*` exception code. Password/secret-encoding errors can
also retain the existing `ARYA_SECURITY_*` codes. Invalid credentials return
false/null/`ok: false` where documented, without echoing secrets in errors.

Session lookup uses a native open-addressed table with SHA-256 digests and
constant-time digest comparison. Tables have at least twice the configured
capacity; rehashing bounds tombstone buildup during churn. Normal verify,
consume, revoke and rotation perform expected constant-time lookups.
Rehash/expiration sweep and `revokeAll` can scan the bounded table. Native storage
participates in collector memory accounting and is cleansed on deletion/close.
Password work uses the existing bounded native worker queue; native local
authentication uses independent dispatch operations. Persistent/shared sessions, account storage and cross-instance revocation
need an application backend. Process restarts clear local stores and limits.

```sh
make native-auth-test
python3 native/tests/auth-http.py
python3 native/benchmarks/auth.py --samples 9 \
  --output .build/auth-performance.json
```

The acceptance suite checks all 18 RFC 6238 vectors, the RFC 7636 vector,
malformed/canonical input, replay counter boundaries, session lifecycle/churn,
one-use concurrency, expiry, recovery, limit exhaustion, password migration and
compiler types. It runs release and ASan/UBSan programs under GC stress without
Node/Python on PATH. A separately compiled portable adapter exercises denied
biometric and vault paths even on macOS. On macOS, a separately compiled
Objective-C harness runs the production adapter against test-only context and
in-memory Keychain seams. It checks strict/owner policies, fresh contexts, OS
errors, busy gating, deadlines, aborts, late callbacks, protected replace/delete,
malformed data and mutation/cancellation races under ASan/UBSan and GC stress.
Production builds contain no runtime mock switch. Python is optional benchmark tooling.
The benchmark compares successful session verification against an Arya Map
reference in the same binary, checking the same snapshot fields. Its result
is not a password, biometric, end-to-end latency or older-release speed claim.

The session measurements below predate the biometric-operation revision; the
linked report records the exact measured source identities. Measured on
13 November 2026, macOS 26.5.2 ARM64, Apple clang 21, release builds:
nine fresh samples per path, alternating order, 100 warmup verifications and
20000 timed verifications per sample. CPU time includes hashing, lookup,
monotonic expiry checks, result snapshots and collector work inside the loop.

| Active sessions | Native median CPU ms | Arya Map median CPU ms | Map / native |
| --- | ---: | ---: | ---: |
| 32 | 25.997 | 53.728 | 2.07× |
| 4096 | 44.443 | 67.853 | 1.53× |

This was a shared development host; initial 1/5/15-minute load averages were
5.35/5.71/5.49. The compiler check overlapped benchmark preparation. These are
local operation CPU measurements, without exclusive CPU reservation. Preserve
the [raw samples, source and binary identities](benchmarks/native-auth-2026-11-13.json)
when comparing later changes.

Real OS biometric success/cancel/lockout and Keychain persistence still require
manual tests on enrolled hardware with a signed application; automated tests neither
prompt the user nor alter their Keychain. The optional HTTP integration uses
Python's standard-library client against the native API example, exercising
password + TOTP login, replay denial, bearer verification, rotation, logout and
throttling; the server executes with no interpreter on PATH.

Complete examples: [native auth API](../native/examples/auth-service.arya) and
[native credential unlock](../native/examples/auth-local.arya).
