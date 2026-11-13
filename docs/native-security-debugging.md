# Native security and diagnostics

The native SDK implements validation, cryptography, assertions, inspection and
structured logging without Node or a JavaScript engine. Build the complete SDK
with `make native-sdk`; security applications link its OpenSSL static library.

## Validate data before trusting it

```arya
use std "validate" as validate
const schema = validate.object({
  account: validate.string({min: 1, max: 64}),
  amount: validate.string({min: 1, max: 128})
})
const data = validate.parse(schema, {account: "cash", amount: "12.50"})
```

Object schemas reject unknown fields by default. `{strict: false}` permits and
discards unknown data fields. Accessors are rejected in either mode without
executing their getter, including nested object fields. An accessor issue has
`code: "accessor"` and the exact field path. This restores the documented data-only
contract; code that previously relied on getters during validation must create
an explicit data snapshot first.

`validate.check(schema, value)` returns `{ok: true, value}` or `{ok: false, issues}`.
`validate.parse` returns the validated copy or throws `ARYA_VALIDATION`, with the
same issues. Diagnostics are capped at 32 issues and nesting at 64 levels.
Optional/default schemas validate their defaults. Ordinary numeric schemas use
finite binary64 values; exact monetary text must subsequently pass the decimal
or accounting library's domain checks.

The low-level `schema.read(value, path, issues, depth?)` method accepts a depth
integer from 0 through 64; nonfinite, fractional and out-of-range values raise
`ARYA_VALIDATION_SCHEMA` before conversion to a machine integer. Application
code should normally use `check` or `parse`.

## Use established cryptography

`std "security"` uses OpenSSL 3.5.9 implementations of SHA-256, HMAC-SHA-256,
AES-256-GCM, secure randomness and scrypt. Arya defines input limits and versioned
encodings; it does not implement its own cryptographic primitive.

- `randomToken(bytes?)` returns canonical base64url; requested entropy is 16–1024
  bytes. `generateKey()` produces a 32-byte key. `uuid()` creates a random v4 UUID.
- `hash(text)` hashes UTF-8 text. `hashBytes(buffer)` hashes up to 16 MiB of raw bytes without text conversion and returns lowercase SHA-256 hexadecimal. It rejects non-Buffer inputs. These are digests, not password-storage APIs.
- `hmac(key, text)` and `verifyHmac` authenticate messages. Signatures are canonical
  lowercase hexadecimal; malformed signatures fail verification.
- `hashPassword` and `verifyPassword` use bounded scrypt profiles on native workers.
  The standard profile uses N=131072, r=8, p=1; strong uses N=262144. Passwords are
  1–1024 UTF-8 bytes. Password verification accepts the documented legacy costs;
  upgrade helpers support migration after successful authentication.
- `keyring({active, keys})` exposes `encrypt`, `decrypt` and `rotate`. Encryption
  uses a fresh random nonce. The v2 authenticated context contains `account` and
  `purpose`; changing either, the selected key, ciphertext or authentication tag
  fails authentication. Keep exact context values for decryption.
- Keys and temporary crypto buffers receive explicit cleanup where owned by the
  native implementation. Managed application strings containing secrets are
  collector-owned and are not guaranteed to be erased from all memory copies.

The existing v1/v2 wire formats are preserved. Authentication failures return
`ARYA_SECURITY_DECRYPT`; malformed configuration/input has separate stable codes.
This work is an implementation audit and regression pass, not an independent
cryptographic audit or certification of the application using these APIs.

### Dependency audit, 13 November 2026

The previous pin, OpenSSL 3.6.4, belonged to a branch that is now unsupported and
predated the September security fixes. The SDK now pins 3.5.9 from the maintained
3.5 LTS branch, supported through 8 April 2030. It was the latest available 3.x
release on the audit date. The archive's SHA-256 matches the upstream checksum:
`603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a`.
See the [official downloads](https://openssl-library.org/source/),
[release policy](https://openssl-library.org/policies/releasestrat/) and
[upstream checksum](https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz.sha256).
This verifies the downloaded archive against the HTTPS-published checksum;
release PGP signatures were not independently verified.

The [10 November advisory](https://openssl-library.org/news/secadv/20261110.txt)
already names 3.5.10 as the fix version, but explicitly schedules those releases
for **1 December 2026**. That archive and its checksum were not yet available.
The pending issues concern AES-GCM-SIV, CMS and QUIC. Arya exposes AES-256-GCM
with fixed 12-byte nonces, and exposes none of those affected modes/protocols;
this is a code-path applicability assessment, not a claim that all of libcrypto
is vulnerability-free. Review and update the pin when 3.5.10 is published.
The [September advisory](https://openssl-library.org/news/secadv/20260929.txt)
also covers TLS/DTLS, certificates, QUIC, CMP and generic EC/SM2 operations that
Arya's security API does not expose. Arya distributes static libcrypto, without
libssl, external crypto modules, engines or the OpenSSL command-line program.

The build directory now includes the version and verified source checksum.
Previously, an existing generic build directory could silently rebuild the old
source after a pin change and then stamp it with the new archive hash. Each
invocation reconfigures the selected source and replaces the installed header
set, preventing stale headers from surviving an upgrade. Building this optional
SDK requires Perl, Make and a C toolchain; running its native executables does
not require Perl or Node.

## Trace only when enabled

```arya
use std "log" as log
let logger = log.create({name: "orders", level: "info"})
if logger.enabled("trace") {
  logger.trace("calculation input", {rows: 100})
}
logger.info("invoice calculated", {requestId: "request-1", total: "12.50"})
```

`enabled(level)` accepts `trace`, `debug`, `info`, `warn`, `error` or `fatal` and
returns whether the logger would emit that level. Child loggers retain the level.
A `silent` logger returns false for every level. The enabled check performs no
allocation, formatting, clock read or sink call inside the logger; a normal Arya
method dispatch still occurs. The branch avoids evaluating expensive field
expressions. A disabled logging method also returns before inspection, but its
arguments have already been evaluated by the language.

Structured logs carry timestamp, level, logger name and message. Recursive
redaction covers common secret names and configured extra names. Getters are
represented as `[Accessor]` without invocation. Repeated references serialize
independently; only an ancestor reference becomes `[Circular]`. Redaction applies
to every repeated occurrence. Bounds on depth, node count, fields, strings and
arrays prevent unbounded log traversal. Free-text messages are not inspected for
secrets: put sensitive data in named fields or omit it.

`debug.assert(condition, message?)` throws an error with code `ARYA_ASSERTION`.
Uncaught errors print the Arya function names and source line/column to stderr;
caught error records do not currently expose a `.stack` string.
`debug.trace(label, value?)` immediately inspects a value and writes a source
location to stderr; use guarded structured trace logging for optional tracing.
`debug.inspect(value, options?)` does not execute getters or custom inspectors.
It accepts `depth` (0–20), `maxArrayLength` (0–1000), `maxObjectKeys` (0–1000), and
`colors`. Both list and record defaults are 50 entries. Wide records now truncate
by default; choose an explicit larger limit when appropriate. Promises share the
same depth/cycle protection, including promises rejected with themselves. Lone
UTF-16 surrogates are escaped instead of being lost during UTF-8 conversion.
Inspection output is bounded to 16 MiB; exceeding that bound propagates a
catchable RangeError through `debug.trace`.

## Example and verification

```sh
make native-sdk
bin/arya build native/examples/secure-service.arya -o .build/secure-service --release
.build/secure-service
sh native/tests/security-diagnostics.sh
```

The dedicated suite covers accessor rejection and paths, malformed depth values,
wide-record validation, bounded errors, repeated aliases and real cycles,
redaction, guarded tracing, promise inspection, UTF-16 diagnostics, trace-output
overflow, source stacks, SHA-256 vectors,
HMAC with NUL, token/UUID shape, authenticated encryption, tampering and context
mismatch. It runs release and ASan/UBSan builds with collector stress and an empty
PATH. The standard profile suite separately covers retained crypto format vectors,
password verification/upgrades, rotation and service integration. On macOS these
sanitizer runs disable leak detection; no leak-detector result is claimed.
Sanitizers instrument the generated Arya runtime; the vendored OpenSSL archive
is built with upstream release options, without sanitizer instrumentation.

On the development macOS arm64 host, the dedicated suite passed 67 assertions
in each of release and ASan/UBSan modes with collector stress. Both modes also
passed uncaught source-stack checks. Running 100 and 10,000 disabled trace guards
used the same 148 runtime calloc-wrapper calls, so this workload incurred zero
additional counted allocations as the guard loop grew. This does not measure
allocations made internally by the C library or OpenSSL. The linked OpenSSL
version and header version both reported `OpenSSL 3.5.9 29 Sep 2026`; all 11
retained security vectors and password/encryption round trips passed against
that library. These results establish regression coverage for the exercised
paths, not general production readiness or a cryptographic certification.

Audit roots: object validation previously called the normal property accessor,
allowing input code to execute; low-level depth conversion was unchecked; logger
cycle detection tracked visited objects instead of the active ancestor chain;
inspection applied bounds to lists but not record fields or promise recursion;
trace output converted the failure sentinel after inspection overflow, allowing a
null-pointer crash instead of propagating the error.
Strict validation now uses the runtime field index instead of scanning every
schema field for every input field. `native/benchmarks/validation.arya` measures
that lookup workload independently of startup and schema setup.

### Validation measurement

The paired run retained nine samples per implementation and width, after one
discarded process per implementation/width and three schema warmups within
every process. Each sample validates the same record 50 times and checks its
result. The measure is process CPU milliseconds from `runtime.clock()`, excluding
startup, schema construction and output.

| Record fields | Before median CPU ms | After median CPU ms | Before / after |
| --- | ---: | ---: | ---: |
| 128 | 4.761 | 2.413 | 1.97× |
| 512 | 68.175 | 10.603 | 6.43× |

Host: macOS 26.5.2 arm64. Acceptance checks and a clean compiler build were active;
the recorded 1/5/15-minute load averages were 9.24/13.57/16.95. These are operation
CPU comparisons under that contention, not idle-machine wall-clock measurements.
Both binaries use release builds without runtime counters. The comparison
includes the other runtime improvements in this refactor and therefore does not
isolate the contribution of indexed strict-field lookup.
[Raw samples and executable/generated-C/source hashes](benchmarks/native-data-2026-11-12/validation-comparison.json)
are retained. The baseline binary and its generated C were preserved before the
runtime edits in `.build/professional-security/`.

```sh
# Baseline executable was compiled before the runtime changes.
.build/independent/arya build native/benchmarks/validation.arya \
  -o .build/professional-security/validation-after --release
python3 native/benchmarks/validation.py \
  --before-binary .build/professional-security/validation-before \
  --after-binary .build/professional-security/validation-after \
  --samples 9 --output .build/validation-comparison-new.json \
  --environment-note 'Record concurrent work and host qualifications here.'
```

Python is an optional measurement controller for this comparison. The timed
programs execute with `PATH=/nonexistent` and do not invoke Python or Node.
