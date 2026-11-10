# Python and JavaScript together

These experimental APIs are included in Arya 1.2.0-alpha.4 for the JavaScript/Node target. Install `arya-language@latest` or build this checkout with `npm run build`.

Arya can coordinate JavaScript libraries and Python functions without handwritten child-process or HTTP glue. Existing direct Python calls remain synchronous. The new JavaScript-profile `python` standard library provides an explicit asynchronous path:

```arya
use std "python" as python
use python "statistics" as statistics
use js "node:crypto" as crypto

keep stats = python.bind(statistics)
keep mean = await stats.mean([10, 20, 30])
keep id = crypto.randomUUID()

say({id: id, mean: mean})
```

Write application logic in Arya, call Python where its libraries help, and use JavaScript/npm libraries normally. You still need to understand each library's API and dependencies; Arya handles the process, transport, and call lifecycle.

## Bind an import for ordinary function calls

`python.bind(moduleOrFunction, options = {})` returns an asynchronous wrapper. It shares the selected client and binds call options such as keyword arguments, deadlines, and cancellation. Python functions then use normal Arya call syntax:

```arya
use std "python" as python
use python "math" as math

keep calculations = python.bind(math)
say(await calculations.sqrt(81))

keep sqrt = python.bind(math.sqrt)
say(await sqrt(16))
```

Bound wrappers also support `function.with(args, kwargs)` to override their keyword arguments. `then` is unavailable so wrappers are not mistaken for promises; `toJSON` is unavailable so JSON serialization cannot accidentally invoke an async Python function. Use the original import with `python.call` when explicitly calling a Python member named `toJSON`. Bindings still use fresh processes for individual calls; they do not create persistent Python objects.

## Calls and keyword arguments

`await python.call(target, args = [], options = {})` accepts a public callable from a `use python` import. The argument list is always positional: a Python function that takes one list receives `[[1, 2, 3]]`, not `[1, 2, 3]`. A plain JavaScript function is not a Python target.

```arya
use std "python" as python
use python "json" as json

keep text = await python.call(json.dumps, [{language: "Arya"}], {
  kwargs: {indent: 2, ensure_ascii: false},
  timeoutMs: 5000
})

say(text)
```

Per-call options are `kwargs`, `signal`, `timeoutMs`, `interpreter`, `maxInputBytes`, and `maxOutputBytes`. Unknown/misspelled options are rejected. Undefined option fields use defaults. `signal` must be an AbortSignal. Already-cancelled signals fail before a child starts; cancellation while queued removes the job.

Calls execute in fresh processes, so module state and Python object identity do not survive calls. Python coroutine results are awaited in their child process using an asyncio runner. Other event-loop frameworks, async generators, callbacks into JavaScript, and live Python objects are outside this contract. The direct synchronous syntax does not acquire coroutine support implicitly.

## Process a list with one Python import

```arya
use std "python" as python
use python "math" as math

keep roots = await python.map(math.sqrt, [4, 9, 16, 25])
say(roots)
```

`python.map(target, values, options = {})` calls the target once per value, passing one positional argument each time. All items run sequentially, in order, in one process and one module instance. This reduces interpreter/import overhead compared with a separate process for each item. The same `kwargs` apply to every item. Lists are limited to 10,000 items; an empty list returns `[]` without starting Python.

Results preserve input order. The first failure stops the batch and rejects with a zero-based `error.index` where available. Earlier side effects are not rolled back, and partial results are not returned. Module state is shared within that batch and discarded afterward. Separate concurrent calls use separate processes; map is not an implicit parallel loop or persistent worker.

For functions needing multiple arguments per item, write a small Python helper accepting an object/list and unpack the arguments there. For dataframe work, keep the transformation in one helper and return records, text, or other supported JSON data. Arya does not automatically transport a pandas DataFrame, NumPy object, or model instance.

## Managed clients and Python environments

```arya
use std "python" as python
use python "math" as math

keep py = python.client({
  timeoutMs: 15000,
  maxConcurrency: 4,
  queueLimit: 32
})

keep environment = await py.info()
say(environment.version, environment.executable, environment.virtualenv)
say(await py.call(math.sqrt, [81]))

await py.close()
```

`python.client(options)` returns `call`, `map`, `bind`, `info`, `stats`, and `close` methods. Client options are:

| Option | Default / behavior |
| --- | --- |
| `interpreter` | `ARYA_PYTHON`, otherwise `python3` on Unix or `python` on Windows. |
| `timeoutMs` | 30,000 ms, including queue wait, spawn, execution, and response. |
| `maxConcurrency` | Four active child processes; configurable from 1 to 64. |
| `queueLimit` | 100 waiting calls; zero rejects work when every active slot is occupied. |
| `maxInputBytes` | 8 MiB of encoded UTF-8 request JSON. |
| `maxOutputBytes` | 8 MiB for each of stdout and stderr. |

Input/output byte limits can be configured from 1 byte to 16 MiB; queue limits from 0 to 10,000; timeout from 1 to 2,147,483,647 ms. Limits are per client and call, not a global machine budget. Share one exported client between modules when you want one application-level concurrency limit. Accepted calls retain their request data while queued; keep input and queue budgets appropriate to the application.

The namespace's `python.call`/`map`/`info` methods use a default client for that standard-library import. A separate `python.client` has its own limits. `stats()` returns `{active, queued, closed}`. `close()` rejects new work and waits for all accepted active/queued jobs to settle; repeated calls share a promise. It does not cancel accepted work or keep idle Python processes alive. Abort accepted jobs through their signals when immediate cancellation is needed.

`await py.info(options = {})` returns `version`, `executable`, `prefix`, `basePrefix`, and `virtualenv`. It runs through the same queue and limits and does not import an application module. It checks interpreter access, not whether every required third-party package is installed. It does not accept `kwargs`.

To use a virtual environment, select its executable explicitly:

```arya
use std "python" as python

keep py = python.client({interpreter: "./.venv/bin/python"})
say(await py.info())
await py.close()
```

Use `./.venv/Scripts/python.exe` on Windows. Relative client/per-call interpreter paths resolve from the Arya module importing the `python` standard library, while the called Python function retains the original directory of its own `use python` import. Bare executable names use PATH. Explicit per-call selection overrides the client setting, which overrides `ARYA_PYTHON` and the platform default. No shell is involved, including paths containing spaces or Unicode. No virtual environment, package installation, or interpreter download happens implicitly.

## Cancellation in servers

```arya
use std "python" as python
use std "web" as web
use python "statistics" as statistics

async fn calculate(request) {
  keep mean = await python.call(statistics.mean, [[10, 20, 30]], {
    signal: request.signal,
    timeoutMs: 5000
  })

  return {mean: mean}
}

web.serve(3000, {"GET /mean": calculate}, {html: false, assets: false})
```

While Python runs, the Node event loop can continue serving JavaScript and other requests. Passing `request.signal` connects HTTP disconnect/deadline cancellation to the Python job. A cancelled/timed-out active call sends SIGTERM, escalates to SIGKILL after 250 ms if necessary, and rejects after the direct child has closed. Cancelled jobs detach lingering pipe handles after that grace period so descendants cannot keep the bridge waiting through inherited stdout/stderr. Queued cancellations do not spawn a process. Process termination does not undo file/database/external side effects; subprocesses created by the Python function are outside this direct-child lifecycle contract.

If a web handler's own deadline expires first, it can send its 504 response while the Python child is still being terminated. Arya tracks that handler work during graceful shutdown. Client close waits for accepted calls, so the application's overall shutdown deadline should account for them.

## Data, errors, and logging

The data boundary remains JSON. Undefined, functions, symbols, bigint, nonfinite numbers, and cycles are rejected as inputs. JSON serialization can apply `toJSON` and omit symbol/non-enumerable keys, as with the existing bridge. Serialize custom values intentionally. Python results must be JSON-compatible; convert dataframe objects, sets, dates, and decimal values explicitly in a helper. Large Python integers may lose JavaScript precision; encode exact integers/decimals as strings. Numeric overflow to a nonfinite JavaScript value is rejected by the new async decoder.

Existing Python diagnostic codes remain useful. The new API adds:

| Code | Meaning |
| --- | --- |
| `ARYA_PYTHON_OPTIONS` | Correct client/call options. |
| `ARYA_PYTHON_CANCELLED` | The supplied signal cancelled the job. |
| `ARYA_PYTHON_QUEUE_FULL` | The client cannot accept more waiting work. |
| `ARYA_PYTHON_CLOSED` | Create another client or avoid starting work after shutdown. |

`ARYA_PYTHON_ARGUMENTS` identifies an invalid target, argument list, keyword object, or oversized map. Other codes cover input, interpreter/module/member access, timeout, output limit, exit, protocol, and unsupported return values as documented in [interop](interop.md).

Python failures include `pythonType`, a bounded `pythonTraceback`, and a batch `index` where available. Error stacks also retain the actual Arya call site when source maps are enabled. Keep tracebacks in trusted diagnostics; return application-specific client errors. Ordinary Python stdout is routed to stderr as logging. Successful-call stderr is forwarded within its configured budget; failed-call logs are capped at 64 KiB of UTF-8 bytes. Native code writing directly to protocol stdout can still corrupt the response and is rejected.

The [reporting service](../fixtures/examples/python-web/README.md) combines JS crypto, Python CSV/statistics, Arya validation, request cancellation, structured logs, and managed shutdown. `npm run check` covers real Python processes, batching, virtual environments, queued/active cancellation, termination escalation, byte budgets, tracebacks, source maps, and HTTP responsiveness.

## Existing code

`use python` imports and direct `library.function(...)`/`.with(...)` calls retain their synchronous, fresh-process behavior. The new library is additive; it does not reserve Python member names such as `call`, `map`, or `info` on imported modules. No application code executes during Check, compilation, or editor analysis. Python calls execute through Node.js-managed child processes.
