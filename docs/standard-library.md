# Native standard library

Import a module with `use std "name" as alias`. The native SDK implements all 18 standard modules from the retained language profile, plus native I/O, process/runtime, accounting, money, finance, CSV and desktop modules. Public module entry points are listed below; returned client/server/schema objects provide the associated methods described by their APIs.

| Module | Entry points |
| --- | --- |
| `async` | `map`, `each`, `sleep` |
| `decimal` | `from`, `add`, `subtract`, `multiply`, `compare`, `divide`, `quantize`, `toNumber`, `roundingModes`, `values` |
| `datetime` | `date`, `instant`, `zoned`, `fromDate`, `toDate`, `dateAt`, `atOffset` |
| `fs` | `readText`, `writeText`, `exists`, `list`, `readTextSync`, `writeTextSync`, `existsSync`, `listSync`, `appendText`, `makeDirectory`, `rename`, `remove`, `tempDirectory`, `removeDirectory`, `publish`, `publishDirectory`, `isFile`, `infoSync` |
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
| `security` | `randomToken`, `uuid`, `generateKey`, `hash`, `hmac`, `verifyHmac`, `timingSafeEqual`, `hashPassword`, `verifyPassword`, `passwordNeedsUpgrade`, `verifyPasswordAndUpgrade`, `keyring`, `encrypt`, `decrypt` |
| `testing` | `test`, `suite`, `skip`, `todo`, `before`, `after`, `beforeEach`, `afterEach`, `assert`, `equal`, `notEqual`, `deepEqual`, `notDeepEqual`, `throws`, `rejects`, `fail`, `mock` |
| `ui` | `is`, `not`, `when`, `section`, `divider`, `link`, `code`, `preview`, `badge`, `alert`, `stat`, `avatar`, `textarea`, `slider`, `checkbox`, `radio`, `switch`, `field`, `progress`, `spinner`, `skeleton`, `empty`, `list`, `table`, `breadcrumbs`, `tabs`, `accordion`, `dialog`, `tooltip`, `open`, `close`, `copy`, `theme`, `toast`, `presets`, `keyframes`, `animate`, `pause`, `resume`, `cancel`, `parallel`, `container`, `buttonGroup`, `image`, `descriptionList`, `timeline`, `steps`, `pagination`, `segmented`, `search`, `meter`, `navbar`, `hero`, `features`, `pricing`, `testimonials`, `faq`, `cta`, `footer`, `templates`, `template`, `bind`, `motion`, `element`, `stack`, `row`, `grid`, `card`, `heading`, `text`, `button`, `input`, `label`, `form`, `select`, `set`, `toggle`, `increment`, `request`, `page` |
| `io` | `print`, `readLine`, `write`, `readChunk` |
| `process` | `run`, `exit`, `env`, `cwd`, `executable`, `error`, `onSignal` |
| `runtime` | `clock`, `collect`, `codeUnit`, `keys`, `platform`, `kind`, `sameValue`, `deepEqual`, `freeze`, `context`, `exitCode`, `defer`, `onFinish`, `elapsed`, `fieldGetter`, `error`, `readFrame`, `writeFrame`, `tag`, `hasAccessor`, `errorMatches`, `stringFromCodes`, `randomUUID`, `isRecord`, `jsonParse`, `jsonStringify`, `uriEncode`, `uriDecode` |
| `accounting` | `backendInfo`, `prepareInvoices`, `prepareLedger`, `invoiceBatch`, `ledgerBatch` |
| `desktop` | `open` |
| `money` | `create`, `add`, `subtract`, `compare`, `format`, `toNumber`, `rescale`, `convert`, `toMinorUnits`, `fromMinorUnits` |
| `finance` | `prepareInvoices`, `invoiceTotals`, `prepareBudgets`, `budgetVariance`, `prepareScores`, `amountScores`, `prepareProduction`, `production`, `allocate`, `straightLine` |
| `csv` | `decoder`, `each` |

Math uses binary64; use decimal strings and `decimal` / `accounting` for exact financial values. [Accounting](accounting-engine.md) documents prepared batches and line rounding. Filesystem operations provide asynchronous read/write/list/exists entry points and explicit synchronous native tooling helpers. JSON supports reviver/replacer, indentation, toJSON, and asynchronous file read/write.

`path.posix` and `path.win32` provide lexical path profiles; top-level behavior follows the host. Both profiles preserve their own cyclic identity. `realPath` uses the host filesystem. `matchesGlob` uses the native bounded matcher profile.

`mysql.connect` returns bounded-pool `rows`, `one`, `scalar`, `execute`, `transaction`, `ping`, `close` methods. Statements are prepared with positional parameters. Transactions keep their connection/context, reject expired scopes, and propagate failures. DECIMAL/BIGINT remain exact strings. A native MySQL C client SDK is an explicit external dependency.

`python.client` provides `call`, `map`, `bind`, `info`, `close` and `stats`, with bounded queues, deadlines, cancellation and structured Python exceptions. Direct `use python` imports use the same explicit native bridge. An interpreter is needed only when invoking Python work.

The native web server provides HTTP/1 routing, responses, validation, health checks, static confinement, deadlines and graceful shutdown. `ui` builds validated HTML and browser assets; it has no Node backend. `desktop.open` uses macOS AppKit/WebKit only when imported.

The [native profile](native-profile.md) defines foreign/host compatibility boundaries, memory behavior, platforms and resource limits. The [SDK guide](native-sdk.md) explains linking and optional dependencies. Detailed historical source-profile guides are retained at [compat/node/docs](../compat/node/docs/README.md); native implementations and acceptance fixtures are under `native/runtime`, `native/libraries` and `native/tests`.

`decimal.values` holds immutable parsed decimals between operations and formats only at explicit output boundaries. `money` checks currency/scale/rounding compatibility. `finance` supplies opt-in batch/allocation policies. `csv` decodes bounded incremental records and waits for consumers before pulling another chunk. These APIs do not migrate existing application policies.
