# Arya standard libraries

**Source candidate: 1.3.0-alpha.2.** Import a library with `use std "name" as alias`. All libraries below run on Node.js.

## JavaScript/Node profile

| Library | Purpose | Contract / implementation |
| --- | --- | --- |
| `list` | Input-first filtering, mapping, sorting, grouping, uniqueness, and totals | [Flow syntax and list API](flow-syntax.md#list-library) |
| `fs` | Async file reads/writes and directory listing | [File APIs](arya-web.md#files-calculations-and-mysql), [runtime source](../src/standard.ts) |
| `path` | Host path operations | [File APIs](arya-web.md#files-calculations-and-mysql), [runtime source](../src/standard.ts) |
| `math` | Mathematical functions/constants | [Calculation APIs](arya-web.md#files-calculations-and-mysql), [runtime source](../src/standard.ts) |
| `json` | JSON parsing/stringification | [File APIs](arya-web.md#files-calculations-and-mysql), [runtime source](../src/standard.ts) |
| `web` | HTTP servers, responses, assets, routes, and lifecycle | [Web guide](arya-web.md), [service contract](services.md) |
| `mysql` | Verified pools, prepared queries, transactions, and result helpers | [MySQL](mysql.md); requires the application's `mysql2` dependency and MySQL server |
| `env` | Environment values and checked configuration | [Configuration](mysql.md#configuration-and-errors) |
| `validate` | Runtime schemas and request validation | [Validation](services.md#validate-application-inputs) |
| `log` | Structured logs and request correlation | [Service logging](services.md) |
| `python` | Async bound calls, batching, clients, and interpreter selection | [Python API](python-async.md); requires Python for execution |
| `debug` | Assertions, inspection, and source-positioned traces | [Debugging](syntax-and-debugging.md) |
| `ui` | Components, browser state, forms, actions, and animations | [Library reference](ui-library.md), [UI/desktop starters](ui-apps.md) |

Checking a standard import validates its library name without opening connections or executing dependency code. Install additional npm/Python packages normally. The libraries do not automatically load `.env` files or create databases. Source/environment examples show which configuration is required.

## Runtime and migration

The native compiler and its libraries are retired from the 1.3 source line. Use `say`, `use std "fs"`, `use std "env"`, and explicit `use js "node:..."` imports for application and operating-system work. See [runtime and migration](node-runtime.md) for replacements and compatibility details.
