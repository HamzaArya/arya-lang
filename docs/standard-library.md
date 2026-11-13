# Native standard library

Import a module with `use std "name" as alias`. The native SDK has **27 public modules**, including all 18 modules from the retained language profile. The catalog below matches [the native manifest](../native/manifest.json). Returned client/server/schema objects provide additional methods described by their APIs; this table lists module entry points.

| Task | Modules to start with |
| --- | --- |
| Exact arithmetic, currencies, balanced journals and reports | `decimal`, `money`, `accounting`, `finance` |
| External input and cryptographic operations | `validate`, `security`, `env` |
| Passwords, sessions, MFA and native biometrics | `auth` |
| Errors, structured logs and automated checks | `debug`, `log`, `testing` |
| Files, paths, JSON, CSV and console streams | `fs`, `path`, `json`, `csv`, `io` |
| Collections, ordinary arithmetic, dates and async work | `list`, `math`, `datetime`, `async` |
| HTTP, HTML and optional desktop windows | `web`, `ui`, `desktop` |
| Host processes, runtime diagnostics and explicit foreign services | `process`, `runtime`, `python`, `mysql` |

These modules ship with the SDK; they are not npm installations. Python, MySQL and desktop functionality retain their explicit feature dependencies, documented below and in [installation](installing.md).

| Module | Entry points |
| --- | --- |
| `async` | `map`, `each`, `sleep` |
| `decimal` | `from`, `add`, `subtract`, `multiply`, `compare`, `divide`, `quantize`, `toNumber`, `roundingModes`, `values` |
| `datetime` | `date`, `instant`, `zoned`, `fromDate`, `toDate`, `dateAt`, `atOffset` |
| `fs` | `readText`, `writeText`, `exists`, `list`, `readTextSync`, `writeTextSync`, `existsSync`, `listSync`, `appendText`, `readBytes`, `readBytesSync`, `writeBytes`, `writeBytesSync`, `appendBytes`, `appendBytesSync`, `writeTextAtomicSync`, `writeBytesAtomicSync`, `makeDirectory`, `rename`, `remove`, `tempDirectory`, `removeDirectory`, `publish`, `publishDirectory`, `isFile`, `infoSync` |
| `math` | `abs`, `acos`, `acosh`, `asin`, `asinh`, `atan`, `atanh`, `atan2`, `cbrt`, `ceil`, `clz32`, `cos`, `cosh`, `exp`, `expm1`, `floor`, `fround`, `f16round`, `hypot`, `imul`, `log`, `log10`, `log1p`, `log2`, `max`, `min`, `pow`, `random`, `round`, `sign`, `sin`, `sinh`, `sqrt`, `tan`, `tanh`, `trunc`, `E`, `LN10`, `LN2`, `LOG10E`, `LOG2E`, `PI`, `SQRT1_2`, `SQRT2` |
| `path` | `normalize`, `isAbsolute`, `join`, `resolve`, `relative`, `dirname`, `basename`, `extname`, `format`, `parse`, `toNamespacedPath`, `_makeLong`, `matchesGlob`, `sep`, `delimiter`, `posix`, `win32`, `realPath` |
| `json` | `parse`, `stringify`, `read`, `write` |
| `web` | `serve`, `route`, `response`, `error`, `health`, `shutdown` |
| `mysql` | `connect` |
| `env` | `get`, `require`, `int`, `bool` |
| `validate` | `string`, `number`, `integer`, `boolean`, `enum`, `optional`, `nullable`, `array`, `object`, `check`, `parse` |
| `log` | `create` |
| `python` | `client`, `call`, `map`, `bind`, `info`, `close`, `stats` |
| `debug` | `assert`, `inspect`, `trace` |
| `list` | `map`, `flatMap`, `filter`, `find`, `reduce`, `groupBy`, `sortBy`, `take`, `unique`, `sum`, `reserve` |
| `security` | `randomToken`, `uuid`, `generateKey`, `hash`, `hashBytes`, `hmac`, `verifyHmac`, `timingSafeEqual`, `hashPassword`, `verifyPassword`, `passwordNeedsUpgrade`, `verifyPasswordAndUpgrade`, `keyring`, `encrypt`, `decrypt` |
| `auth` | `hashPassword`, `verifyPassword`, `verifyPasswordAndUpgrade`, `passwordNeedsUpgrade`, `sessions`, `challenges`, `generateTotpSecret`, `totpCode`, `verifyTotp`, `totpUri`, `pkce`, `recoveryCodes`, `consumeRecoveryCode`, `bearer`, `requireMethods`, `rateLimiter`, `biometricStatus`, `authenticate`, `vault` |
| `testing` | `test`, `suite`, `skip`, `todo`, `before`, `after`, `beforeEach`, `afterEach`, `assert`, `equal`, `notEqual`, `deepEqual`, `notDeepEqual`, `throws`, `rejects`, `fail`, `mock` |
| `ui` | `is`, `not`, `when`, `section`, `divider`, `link`, `code`, `preview`, `badge`, `alert`, `stat`, `avatar`, `textarea`, `slider`, `checkbox`, `radio`, `switch`, `field`, `progress`, `spinner`, `skeleton`, `empty`, `list`, `table`, `breadcrumbs`, `tabs`, `accordion`, `dialog`, `tooltip`, `open`, `close`, `copy`, `theme`, `toast`, `presets`, `keyframes`, `animate`, `pause`, `resume`, `cancel`, `parallel`, `container`, `buttonGroup`, `image`, `descriptionList`, `timeline`, `steps`, `pagination`, `segmented`, `search`, `meter`, `navbar`, `hero`, `features`, `pricing`, `testimonials`, `faq`, `cta`, `footer`, `templates`, `template`, `bind`, `motion`, `element`, `stack`, `row`, `grid`, `card`, `heading`, `text`, `button`, `input`, `label`, `form`, `select`, `set`, `toggle`, `increment`, `request`, `page` |
| `io` | `print`, `readLine`, `write`, `readChunk` |
| `process` | `run`, `exit`, `env`, `cwd`, `executable`, `error`, `onSignal` |
| `runtime` | `clock`, `collect`, `codeUnit`, `keys`, `platform`, `kind`, `sameValue`, `deepEqual`, `freeze`, `context`, `exitCode`, `defer`, `onFinish`, `elapsed`, `fieldGetter`, `error`, `readFrame`, `writeFrame`, `tag`, `hasAccessor`, `errorMatches`, `stringFromCodes`, `randomUUID`, `isRecord`, `jsonParse`, `jsonStringify`, `uriEncode`, `uriDecode` |
| `accounting` | `backendInfo`, `prepareInvoices`, `prepareLedger`, `invoiceBatch`, `ledgerBatch`, `validateTransaction`, `prepareJournal`, `journalBatch`, `trialBalance`, `financialStatements` |
| `desktop` | `open` |
| `money` | `create`, `add`, `subtract`, `compare`, `format`, `toNumber`, `rescale`, `convert`, `toMinorUnits`, `fromMinorUnits` |
| `finance` | `prepareInvoices`, `invoiceTotals`, `prepareBudgets`, `budgetVariance`, `prepareScores`, `amountScores`, `prepareProduction`, `production`, `allocate`, `straightLine` |
| `csv` | `decoder`, `each` |

Math uses binary64; use decimal strings and `decimal` / `accounting` for exact financial values. [Accounting](accounting-engine.md) documents prepared batches and line rounding. Filesystem operations provide asynchronous read/write/list/exists entry points and explicit synchronous native tooling helpers. JSON supports reviver/replacer, indentation, toJSON, and asynchronous file read/write.

`fs.readBytes(path)` returns a promise of a native `Buffer`; `readBytesSync` returns it directly. Binary reads preserve every byte, including NUL and invalid UTF-8, and accept files up to 16 MiB (larger files fail with `RangeError`). `writeBytes(path, buffer)` and `appendBytes(path, buffer)` return promises; their `Sync` variants finish before returning. They require an actual `Buffer` (including a `slice`/`subarray` view); invalid inputs fail before opening the destination. Convert text or lists explicitly with `Buffer.from(...)`. Writes are ordinary filesystem writes, not transactional publication: stage and rename when atomic replacement is needed. Filesystem failures retain the OS error code, operation and path. The byte buffer contract is currently checked at runtime, as with the existing global `Buffer` API.

`fs.writeTextAtomicSync(path, text)` and `writeBytesAtomicSync(path, buffer)` replace a complete file using an exclusively created private sibling and an atomic rename. Both accept up to 16 MiB, check the write and close results, and clean up staging files on ordinary failure. Existing symlink targets (including dangling links), directories and special files are rejected with `ARYA_FS_TARGET`; an unrelated `path + ".tmp"` is never touched. The replacement is a new file with owner-only permissions (`0600`). These synchronous operations guarantee atomic visibility on the host filesystem, not power-loss durability (`fsync`), preservation of metadata, or coordination between concurrent writers; use an application lock when multiple writers share a store. Parent directories must already exist.

`path.posix` and `path.win32` provide lexical path profiles; top-level behavior follows the host. Both profiles preserve their own cyclic identity. `realPath` uses the host filesystem. `matchesGlob` uses the native bounded matcher profile.

`mysql.connect` returns bounded-pool `rows`, `one`, `scalar`, `execute`, `transaction`, `ping`, `close` methods. Statements are prepared with positional parameters. Transactions keep their connection/context, reject expired scopes, and propagate failures. DECIMAL/BIGINT remain exact strings. A native MySQL C client SDK is an explicit external dependency.

`python.client` provides `call`, `map`, `bind`, `info`, `close` and `stats`, with bounded queues, deadlines, cancellation and structured Python exceptions. Direct `use python` imports use the same explicit native bridge. An interpreter is needed only when invoking Python work.

The native web server provides HTTP/1 routing, responses, validation, health checks, static confinement, deadlines and graceful shutdown. `ui` builds validated HTML and browser assets; it has no Node backend. `desktop.open` uses macOS AppKit/WebKit only when imported.

The [native profile](native-profile.md) defines foreign/host compatibility boundaries, memory behavior, platforms and resource limits. The [SDK guide](native-sdk.md) explains linking and optional dependencies. Detailed historical source-profile guides are retained at [compat/node/docs](../compat/node/docs/README.md); native implementations and acceptance fixtures are under `native/runtime`, `native/libraries` and `native/tests`.

`decimal.values` holds immutable parsed decimals between operations and formats only at explicit output boundaries. `money` checks currency/scale/rounding compatibility. `finance` supplies opt-in batch/allocation policies. `csv` decodes bounded incremental records and waits for consumers before pulling another chunk. These APIs do not migrate existing application policies.

`decimal.quantize(value, places, rounding)` and `decimal.divide(left, right, places, rounding)` require an explicit supported rounding mode, as do their `decimal.values` equivalents. Typed code rejects omitted arguments. Unannotated code remains dynamic; a missing/invalid mode raises `ARYA_DECIMAL_ROUNDING`, while missing/invalid places raises `ARYA_DECIMAL_PLACES`. The checker accepts inferred option records for `web.serve`, `web.health`, and `web.shutdown` because these library operations read their input fields without assigning them; invalid field types remain errors.

Logger objects expose `enabled(level)` so callers can guard expensive trace payload construction. Inspection supports `maxObjectKeys` as well as depth and array limits. See [native security and debugging](native-security-debugging.md) for validation, redaction, diagnostic budgets and tests.

The [authentication guide](native-auth.md) documents opaque sessions, one-use challenges, TOTP/recovery replay handling, PKCE, attempt limits and native macOS biometrics/Keychain storage. Session stores and limiters are process-local. Other hosts explicitly report unavailable local authentication; passwords, sessions and MFA retain their native crypto implementation.
