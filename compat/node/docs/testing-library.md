# Testing library

**Unreleased source candidate.** Build this checkout with `npm run build` and use `node dist/cli.cjs`; the published 1.3.0-alpha.9 package does not include `std "testing"`. Requires Node.js 22.15+, with no additional packages.

Save this as `main.test.arya`:

```arya
use std "testing" as t

t.test("adds prices", fn() {
  t.equal(1200 + 300, 1500)
  t.deepEqual({roles: ["reader"]}, {roles: ["reader"]})
})

t.test("handles async failures", async fn() {
  await t.rejects(async fn() { throw {code: "OFFLINE"} }, {code: "OFFLINE"})
}, {timeoutMs: 1000})
```

Run `node dist/cli.cjs test main.test.arya`. Arya builds the entry and its imported Arya modules, then runs [Node's test runner](https://nodejs.org/download/release/v22.15.0/docs/api/test.html) with source maps. Failed tests, rejected async bodies, and timeouts produce a nonzero exit status and source-positioned errors. Checking the file registers or executes no tests.

See the [multi-file invoice example](../fixtures/examples/testing/README.md) and [library regressions](../tests/testing.test.ts).

## Tests and suites

| Call | Behavior |
| --- | --- |
| `t.test(name, callback, options = {})` | Register a named sync or async test. The callback receives a Node `TestContext`. Returns a promise. |
| `t.suite(name, callback, options = {})` | Group tests and scope hooks; callback receives a Node `SuiteContext`. Returns a promise. |
| `t.skip(name, reason = true)` | Register a skipped test without a body. |
| `t.todo(name, reason = true)` | Report planned coverage without a body; does not fail the run. |
| `t.before(callback)` / `t.after(callback)` | Run once before/after tests in the current suite. |
| `t.beforeEach(callback)` / `t.afterEach(callback)` | Run before/after each test in the current suite. |

Names must be nonempty text. Bodies/hooks must be functions; return/await asynchronous work so the runner can observe failures. Callbacks receive one context argument and use returned promises, with no legacy `done` callback.

Options accept only these keys:

| Option | Contract |
| --- | --- |
| `timeoutMs` | Positive integer up to 2147483647, mapped to Node's timeout in milliseconds. Omitted means Node's inherited/default timeout. |
| `skip` | Boolean or reason string. Truthy values skip the body. |
| `todo` | Boolean or reason string. Node reports TODO status and excludes failures from the failure count. |
| `concurrency` | Positive safe integer controlling the maximum concurrent subtests; omitted uses Node's inherited/default behavior. |

Unknown options and invalid arguments throw `TypeError`. The `skip` and `todo` convenience methods always mark their tests even if passed an empty reason or false. Set explicit timeouts for network and service tests. Timeouts report failure but cannot preempt a synchronous infinite loop or cancel arbitrary background work; use abort signals and cleanup for resources.

```arya
use std "testing" as t

t.suite("basket", fn() {
  let items = []
  t.beforeEach(fn() { items = ["book"] })
  t.afterEach(fn() { items = [] })

  t.test("starts fresh", fn() { t.deepEqual(items, ["book"]) })
})

t.skip("live payment gateway", "needs test credentials")
t.todo("refund audit trail")
```

Register suite tests directly inside the suite callback. For subtests inside a running test, use and await `context.test(name, callback)`; this is Node's API with Node's option names. Use `context.after(callback)` to tie cleanup to one test. Concurrent tests must own their data/resources rather than sharing mutable suite state.

## Assertions

Assertions use [Node's strict assertion implementation](https://nodejs.org/download/release/v22.15.0/docs/api/assert.html#strict-assertion-mode). Failures retain `ERR_ASSERTION`, actual/expected values, useful diffs, and Arya source locations.

| Call | Requirement |
| --- | --- |
| `t.assert(condition, message?)` | Condition is truthy. |
| `t.equal(actual, expected, message?)` | Strict equality; no string/number coercion. |
| `t.notEqual(actual, expected, message?)` | Strict inequality. |
| `t.deepEqual(actual, expected, message?)` | Deep strict equality, including nested arrays/objects. |
| `t.notDeepEqual(actual, expected, message?)` | Nested values differ. |
| `t.throws(callback, expected?, message?)` | Synchronous callback throws a matching error. |
| `await t.rejects(callback, expected?, message?)` | Callback's async operation rejects with a matching error. |
| `t.fail(message?)` | Fail explicitly. |

Error matchers can be objects such as `{code: "INVALID_QUANTITY"}` or `{message: "Exact message"}`, error constructors, regular expressions from JavaScript interop, or Node-compatible predicates. Omit the matcher to accept any error. A string matcher is rejected to avoid Node interpreting it as an assertion message. Supply a custom message as the third argument, using `undefined` for an omitted matcher.

Always await `t.rejects`. To test an async function, use `rejects` so its rejection is observed.

## Mocks

```arya
use std "testing" as t

t.test("sends one receipt", fn(context) {
  const send = t.mock(fn(recipient) => {accepted: true})
  t.deepEqual(send("reader@example.com"), {accepted: true})
  t.equal(send.mock.callCount(), 1)
  t.deepEqual(send.mock.calls[0].arguments, ["reader@example.com"])

  const store = {read: fn() => "real"}
  context.mock.method(store, "read", fn() => "fixture")
  t.equal(store.read(), "fixture")
})
```

`t.mock(implementation?)` creates a Node mock function; the default returns undefined. Inspect `.mock.calls` for arguments, results, errors, and receiver; use `.mock.resetCalls()` to clear history. This convenience uses Node's module-level mock tracker. For automatic test-local cleanup, use `context.mock.fn(...)` or `context.mock.method(...)`; the context tracker restores mocks when the test ends. Avoid sharing mocks across concurrent tests. Experimental module mocking, timer mocking, snapshots, and coverage are not wrapped by this library.

## CI and scope

Point your project's test script at its entry, for example `arya test tests/main.test.arya` when the locally built compiler is installed. One entry can import other `.test.arya` modules. The CLI currently requires one explicit `.arya` entry; it does not discover test files or forward Node reporter/coverage/watch flags. Output follows the host Node version's default reporter. Direct `use js "node:test"` and `use js "node:assert/strict"` imports continue to work.

Both libraries include passive editor completions and static signatures. `testing` runs on the Node host; it is not a browser testing framework.
