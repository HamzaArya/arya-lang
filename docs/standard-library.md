# Arya standard libraries

**Published preview: 1.3.0-alpha.7; source candidate: unpublished 1.3.0-alpha.9.** Import a library with `use std "name" as alias`. All libraries below run on Node.js and are included in published alpha.7. The older 1.2 release on `latest` lacks `list`, `decimal`, `datetime` and `async`. Follow [candidate setup](node-runtime.md#try-the-candidate) for unreleased fixes.

## JavaScript/Node profile

| Library | Purpose | Contract / implementation |
| --- | --- | --- |
| `decimal`, `datetime`, `async` | Exact decimal strings, strict dates/instants/zones, bounded async streaming | [Business APIs](business-applications.md) |
| `list` | Input-first filtering, mapping, sorting, grouping, uniqueness, and totals | [Flow syntax and list API](flow-syntax.md#list-library) |
| `fs` | Async file reads/writes and directory listing | [Files](#files) |
| `path` | Host path operations | [Paths and mathematics](#paths-and-mathematics) |
| `math` | Mathematical functions/constants | [Paths and mathematics](#paths-and-mathematics) |
| `json` | JSON parsing/stringification and file helpers | [JSON](#json) |
| `web` | HTTP servers, responses, assets, routes, and lifecycle | [Web guide](arya-web.md), [service contract](services.md) |
| `mysql` | Verified pools, prepared queries, transactions, and result helpers | [MySQL](mysql.md); requires the application's `mysql2` dependency and MySQL server |
| `env` | Environment values and checked configuration | [Environment](#environment) |
| `validate` | Runtime schemas and request validation | [Validation](services.md#validate-application-inputs) |
| `log` | Structured logs and request correlation | [Service logging](services.md) |
| `python` | Async bound calls, batching, clients, and interpreter selection | [Python API](python-async.md); requires Python for execution |
| `debug` | Assertions, inspection, and source-positioned traces | [Debugging](syntax-and-debugging.md) |
| `ui` | Components, browser state, forms, actions, and animations | [Library reference](ui-library.md), [UI/desktop starters](ui-apps.md) |

Checking a standard import validates its library name without opening connections or executing dependency code. Install additional npm/Python packages normally. The libraries do not automatically load `.env` files or create databases. Source/environment examples show which configuration is required.

## Files

```arya
use std "fs" as fs
use std "json" as json

await json.write("report.json", {completed: 2, total: 3})
const report = await json.read("report.json")
print(report.completed, report.total)
print(await fs.exists("report.json"))
```

This writes `report.json` in the process working directory and prints `2 3` and `true`. File/JSON helpers resolve relative paths from that working directory, unlike source-relative import paths and the web library's default asset root.

| Call | Result |
| --- | --- |
| `await fs.readText(path)` | Read a UTF-8 file as text. |
| `await fs.writeText(path, text)` | Create or replace a file with UTF-8 text; resolves to undefined. Parent directories must already exist. |
| `await fs.list(path)` | Return directory entry names as a list of strings; ordering follows the host filesystem. |
| `await fs.exists(path)` | Return true if Node can access the path, false for `ENOENT`; other access errors reject. |

These helpers use Node's filesystem APIs and propagate their errors. For additional operations such as directory creation, appending, streaming, or removal, import `node:fs/promises` or `node:fs` explicitly. The implementation is in [src/standard.ts](../src/standard.ts).

## JSON

| Call | Result |
| --- | --- |
| `json.parse(text)` | Parse JSON synchronously; invalid JSON throws. |
| `json.stringify(value)` | Serialize synchronously with JavaScript's default JSON behavior. |
| `await json.read(path)` | Read UTF-8 text and parse its JSON. |
| `await json.write(path, value)` | Write JSON with two-space indentation and a final newline. |

`parse`/`stringify` wrap the corresponding `JSON` methods with one argument; they do not accept reviver/replacer/spacing options. Use the host `JSON` binding directly for those options. Serialization follows JavaScript rules, including `toJSON`, omission of unsupported object members, nonfinite numbers becoming null, and errors for cycles or bigint. This is separate from the stricter Python transport contract. `json.write` inherits those rules and does not make an atomic file replacement.

## Paths and mathematics

`path` exposes Node's `node:path` namespace, including `join`, `resolve`, `dirname`, `basename`, `extname`, `sep`, `posix`, and `win32`. Default operations follow the host OS. `path.resolve` uses the process working directory; it does not make a path relative to the Arya source file.

`math` exposes JavaScript's `Math` object, including `sqrt`, `abs`, `floor`, `ceil`, `round`, `pow`, `min`, `max`, `random`, `PI`, and `E`. Numeric precision, nonfinite results, and random-number behavior follow the host JavaScript runtime.

## Environment

`env` reads the running process environment without loading `.env` files:

| Call | Behavior |
| --- | --- |
| `env.get(name, fallback = null)` | Return text or the fallback when absent; preserve empty text. |
| `env.require(name)` | Return the original text; reject absent, empty, or whitespace-only values. |
| `env.int(name, fallback)` | Parse a signed decimal safe integer or a numeric fallback; reject whitespace, fractions, and unsafe integers. |
| `env.bool(name, fallback)` | Accept boolean fallbacks or text `true`, `false`, `1`, or `0`, case-insensitively. |

Names must match `[A-Za-z_][A-Za-z0-9_]*`. Codes are `ARYA_ENV_NAME`, `ARYA_ENV_REQUIRED`, and `ARYA_ENV_VALUE`; messages identify the name without exposing its value. Typed reads with no value or fallback fail. See [database configuration](mysql.md#configuration-and-errors) for an application example and [src/std/env.ts](../src/std/env.ts) for the implementation.

## Runtime and migration

The native compiler and its libraries are retired from the 1.3 source line. Use `print`, `use std "fs"`, `use std "env"`, and explicit `use js "node:..."` imports for application and operating-system work. See [runtime and migration](node-runtime.md) for replacements and compatibility details.
