# Building dependable services with Arya

These experimental APIs are included in Arya 1.2.0-alpha.4. They run on the JavaScript/Node profile. Checking and editor analysis remain passive; the native profile does not gain networking, logging, or validation libraries from this work.

Start with the [multi-file service example](../fixtures/examples/service/README.md), which has separate startup, handlers, and schemas. The [MySQL task API](../fixtures/examples/mysql/README.md) adds durable storage and transaction-backed audit records.

## Validate application inputs

Define the input once, then attach it to a route:

```arya
use std "validate" as validate
use std "web" as web

keep newItem = validate.object({
  title: validate.string({trim: true, min: 1, max: 200}),
  completed: validate.optional(validate.boolean(), false)
})

fn createItem(request) {
  # Input has already been validated and normalized.
  return web.response(201, request.body)
}

web.serve(3000, {
  "POST /api/items": web.route(createItem, {body: newItem})
}, {html: false, assets: false})
```

`web.route(handler, schemas)` accepts optional `body`, `query`, and `params` schemas. All provided schemas must pass before the handler runs. Normalized copies replace those request fields. Invalid inputs return 400 with `code: "ARYA_VALIDATION"` and an `issues` list containing paths, issue codes, and messages. Rejected values are not included. Paths such as `["body", "title"]` identify the field. The response header contains the request ID.

| Schema | Behavior |
| --- | --- |
| `validate.string({min, max, trim = false})` | Text, optional trimming, UTF-16 length bounds. |
| `validate.number({min, max, integer = false, coerce = false})` | Finite numbers with optional bounds. |
| `validate.integer({min, max, coerce = false})` | Safe JavaScript integers. |
| `validate.boolean({coerce = false})` | Booleans; explicit coercion also accepts `"true"`/`"false"`. |
| `validate.enum(values)` | One of a nonempty list of finite primitive values. |
| `validate.optional(schema, default?)` | Permit an absent value, optionally using a validated, copied default. |
| `validate.nullable(schema)` | Permit null or a value matching the inner schema. |
| `validate.array(schema, {min, max})` | Validate each list item; maximum 10,000 items. |
| `validate.object(fields, {strict = true})` | Validate named fields; reject unknown fields by default. `strict:false` discards them. |

Direct validation is also useful for files and Python/JavaScript results:

```arya
use std "validate" as validate

keep input = validate.object({count: validate.integer({min: 1, max: 100})})
keep result = validate.check(input, {count: 10})

if result.ok {
  say(result.value.count)
} else {
  say(result.issues)
}
```

`validate.check` returns `{ok:true, value}` or `{ok:false, issues}`. `validate.parse` returns the value or throws `ARYA_VALIDATION`. Bad schema configuration throws `ARYA_VALIDATION_SCHEMA` immediately at execution time. Schemas reject misspelled options, inverted bounds, and invalid defaults.

Coercion is opt-in. Numeric strings use a decimal/exponent grammar; whitespace, hex, empty strings, nonfinite values, and numeric suffixes are rejected. Query parameters arrive as strings, so choose coercion explicitly. Integer schemas do not represent arbitrary-precision database identifiers: keep those as strings when needed. Objects are copied without prototype-setting assignments; data accessors are rejected. Diagnostics are capped at 32 issues and validation depth at 64 levels. This is runtime data validation, not a static type system or a JSON Schema implementation.

## Routes and request context

Route keys support exact paths, method-qualified paths, and named segments:

```arya
use std "web" as web
use std "validate" as validate

keep path = validate.object({id: validate.integer({coerce: true, min: 1})})

web.serve(3000, {
  "GET /api/items/:id": web.route(fn(request) {
    return {id: request.params.id, requestId: request.requestId}
  }, {params: path})
}, {html: false, assets: false})
```

Exact routes win over parameter routes. Parameter routes prefer more literal segments, then method-qualified routes, then declaration order. Duplicate parameter names and equivalent parameter patterns for the same method are rejected at startup. Empty segments, malformed URL escapes, encoded slashes/backslashes, and NUL parameter values are rejected or do not match. Wildcards and regular-expression routes are not provided. HEAD falls back to GET unless a matching HEAD or path-only route takes precedence; its body is suppressed.

Handlers receive `method`, `path`, `headers`, `query`, `params`, `body`, `requestId`, `signal`, and optional `log` when a server logger is configured. Duplicate query names retain the existing last-value behavior. `signal` is an AbortSignal, cancelled on handler deadline, client disconnect, or forced shutdown. Async dependencies must honor that signal to stop their own work.

Every request gets a generated UUID in `x-request-id`. With `trustRequestId:true`, a value supplied by a trusted proxy may be accepted if it contains 1–128 ASCII letters, digits, periods, underscores, colons, or hyphens. Invalid IDs are replaced. This is a correlation value, not authentication or a unique-user identity. Response headers cannot override the selected ID.

The optional `before` server callback receives the request after body decoding and before schema validation. Returning `undefined` continues; any other result short-circuits the route. It can integrate an application-specific authentication or policy check. Arya does not supply an identity provider or assume that possessing a request ID authorizes access.

Throw `web.error(status, message, code?)` for a catchable HTTP error. Status must be 400–599; codes use uppercase letters, digits, and underscores. Server errors return a generic message. For example:

```arya
use std "web" as web

fn missing() {
  throw web.error(404, "Item was not found.", "ITEM_NOT_FOUND")
}
```

Existing function handlers, static route values, `web.response`, HTML entry files, and asset serving remain supported. Named parameter routes, request context fields, and GET fallback for HEAD are additive alpha.4 behavior. Existing internal-error responses retain their `error` field; an explicit error code adds `code`. Validation responses also include `issues`.

## Structured logs

```arya
use std "log" as log

keep logger = log.create({name: "orders", level: "info"})
keep requestLog = logger.child({requestId: "example-request"})

requestLog.info("order.created", {orderId: "42"})
requestLog.error("order.failed", {code: "PAYMENT_UNAVAILABLE"})
```

Logs are one JSON record per line, with `timestamp`, `level`, `name`, and `message`. Core metadata cannot be replaced by fields. Methods are `trace`, `debug`, `info`, `warn`, `error`, and `fatal`; `silent` disables all output. Fatal logging does not exit the process. `child(fields)` snapshots bounded, sanitized fields for correlation.

`log.create` accepts `name`, `level`, optional `redact` field names, and an optional synchronous `sink(line)` function. The default sink writes to stdout. Recursive, case-insensitive field redaction covers password/passwd/pwd, secret, token, authorization, cookie/set-cookie, API key, access token, and refresh token, ignoring underscores and hyphens. Custom redact entries add names; defaults cannot be disabled. Redaction matches field names, so do not put secrets into message text or arbitrary unrecognized fields.

Serialization handles bigint and repeated/cyclic references, bounds depth to eight and field/item counts to 100, and truncates long strings to 8192 characters. A node budget also bounds traversal. Getters and `toJSON` methods are not executed. Error fields omit stack and cause; trusted server diagnostics can handle these separately. Invalid logger configuration uses `ARYA_LOG_CONFIG`. The default stdout sink follows Node stream buffering and does not provide durable delivery or a log transport queue; use a configured external logging system for those guarantees.

Pass a logger through `web.serve(..., {logger})` to give handlers `request.log` and emit access/error records with the request ID. Access records include method, URL pathname, status, and elapsed milliseconds. Query strings, headers, bodies, and raw exception details are not logged automatically. Paths can still contain sensitive application identifiers. Logger write failures are prevented from changing HTTP responses.

## Readiness and deadlines

`await web.health(checks, {timeoutMs = 1000})` runs named check functions concurrently. Each receives an AbortSignal. Resolving anything other than `false` succeeds; false or rejection fails. The result is a `web.response`-compatible value: 200 with `status: "ready"`, or 503 with `status: "unready"`. Named results are `ok`, `failed`, or `timeout`. Failure messages are not exposed; `cache-control: no-store` is set.

Keep liveness separate from dependency readiness. A liveness route can simply return `{status:"ok"}`. A database-backed readiness handler can return `web.health({mysql: fn() { return db.ping() }})`.

`requestTimeoutMs` defaults to 30,000 and limits receiving the HTTP request through Node's server. `handlerTimeoutMs` defaults to 30,000 and separately bounds the asynchronous hook/handler response wait after body decoding. Its expiry returns 504 with `ARYA_HTTP_TIMEOUT` and cancels the request signal. These timers cannot preempt synchronous JavaScript or direct synchronous Python calls. The opt-in [async Python bridge](python-async.md) can terminate its child process when the request signal is passed through. Ignoring cancellation may leave background work running; a timeout does not roll back a database transaction or undo an external side effect. A readiness timeout has the same cooperative-cancellation limitation.

## Controlled shutdown

```arya
use std "web" as web

async fn stop(server, db) {
  await web.shutdown(server, {
    timeoutMs: 10000,
    cleanup: async fn() {
      await db.close()
    }
  })
}
```

`web.shutdown` stops accepting connections, drains active requests and tracked handler work, then runs the optional cleanup callback. Repeated calls share one promise. Calling from its own active request rejects with `ARYA_SHUTDOWN_CONTEXT`, preventing a wait on that same request. The overall deadline includes cleanup. On expiry, request signals are cancelled, HTTP connections are closed, and the promise rejects with `ARYA_SHUTDOWN_TIMEOUT`. Cleanup is not started after a drain timeout; already-running cleanup cannot be forcibly cancelled. The helper does not terminate the process or install signal handlers. Applications decide when to call it and how to handle a failed shutdown, as shown in the examples. WebSocket/upgraded connections are outside this HTTP-only helper.

These APIs improve application correctness and operations. They do not by themselves establish a production SLA, enterprise certification, authentication system, or complete platform qualification. Use the documented test results and deployment requirements when evaluating a release.
