# MySQL applications with Arya

These experimental APIs are included in Arya 1.2.0-alpha.4 for the JavaScript/Node target. Install `arya-language@latest` or build this checkout with `npm run build`.

Arya's JavaScript profile provides a managed MySQL library:

```arya
use std "env" as env
use std "mysql" as mysql

keep db = await mysql.connect({
  host: env.get("DB_HOST", "127.0.0.1"),
  port: env.int("DB_PORT", 3306),
  user: env.require("DB_USER"),
  password: env.get("DB_PASSWORD", ""),
  database: env.require("DB_NAME")
})

keep tasks = await db.rows(
  "SELECT id, title FROM tasks WHERE completed = ? ORDER BY id DESC LIMIT 100",
  [false]
)

each item in tasks {
  say(item.title)
}

await db.close()
```

Install `mysql2` in your application with `npm install mysql2`. Provide a running MySQL server and an existing database; importing the library does not install a driver, create a database, or load a `.env` file. `arya check`, editor diagnostics, and completion never connect or load the driver. Database access runs in the Node.js backend.

## Connections

`await mysql.connect(options)` creates a reusable pool, acquires and releases an initial connection to verify credentials and database access, and returns the database handle. A failed connection closes its pool before throwing. Keep one pool per application rather than opening one for every request.

Common options are `host`, `port`, `user`, `password`, `database`, `socketPath`, `ssl`, `connectionLimit`, `queueLimit`, and `connectTimeout`. TLS options pass through to mysql2, including a CA certificate in `ssl.ca`. See the driver's [pool documentation](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-pool).

Defaults are 10 connections, 100 queued connection requests, a 10-second connection timeout, and waiting for available connections. Setting `queueLimit: 0` explicitly restores the driver's unbounded queue. The connection timeout does not impose a query or transaction deadline. Health checks and SQL calls can take as long as their server/network operations; closing waits for active work, so applications should also set an overall shutdown deadline.

BIGINT values are returned as strings by default; DECIMAL retains the driver's exact string representation. Applications may explicitly override the driver's numeric options when they accept precision loss. Avoid converting identifiers to JavaScript numbers when they may exceed the safe-integer range. Dates, buffers, JSON columns, and other result types follow mysql2's configured conversion rules.

## Query results

| Call | Result |
| --- | --- |
| `await db.rows(sql, params = [])` | All rows; rejects a write-result packet. |
| `await db.one(sql, params = [])` | First row, or `null`. |
| `await db.scalar(sql, params = [])` | First column of the first row, or `null`. Prefer a one-column SELECT. |
| `await db.execute(sql, params = [])` | Row data or a write-result packet containing fields such as `affectedRows` and `insertId`. |
| `await db.ping()` | `true`, or an error if connectivity fails. |
| `await db.close()` | Wait for active operations, then close the pool. Repeated calls share the same result. |

Every SQL call uses mysql2's prepared `execute` API. Pass values separately using `?` placeholders:

```arya
keep saved = await db.execute(
  "INSERT INTO tasks (title) VALUES (?)",
  ["Learn Arya"]
)

keep item = await db.one(
  "SELECT id, title FROM tasks WHERE id = ?",
  [saved.insertId]
)
```

Parameters can contain text, finite numbers, booleans, `null`, bigint, valid JavaScript dates, and buffers. Serialize JSON with `json.stringify` before passing it. Undefined, arrays, and arbitrary objects are rejected with a useful error. Placeholders represent values, not table or column names; choose identifiers from application-controlled constants. Multiple statements and named placeholders are disabled. Result-field metadata is not included.

## Transactions

Related writes use one dedicated connection:

```arya
keep item = await db.transaction(async fn(tx) {
  keep saved = await tx.execute(
    "INSERT INTO tasks (title) VALUES (?)",
    ["Ship the application"]
  )

  await tx.execute(
    "INSERT INTO task_events (task_id, action) VALUES (?, ?)",
    [saved.insertId, "created"]
  )

  return await tx.one(
    "SELECT id, title FROM tasks WHERE id = ?",
    [saved.insertId]
  )
})
```

Successful callbacks commit and return their result. Callback or query failures roll back and release the connection. A failed rollback destroys the connection rather than returning it to the pool. The original callback exception is preserved. Commit errors can have an unknown outcome: Arya does not retry automatically.

Use `tx.rows`, `tx.one`, `tx.scalar`, and `tx.execute` inside the callback. Pool operations, nested pool transactions, and closing that pool from its transaction are rejected to avoid accidental out-of-transaction work and self-deadlocks. The transaction handle becomes invalid when its callback finishes. A failed transaction query aborts the transaction even if its rejection was caught inside the callback. Already-started queries finish before commit or rollback; always await calls explicitly in application code. Scheduled future work must not retain the transaction handle.

Use a transactional engine such as InnoDB. MySQL DDL and other statements that implicitly commit are outside the rollback guarantee. Callbacks should not manually issue BEGIN, COMMIT, ROLLBACK, or change autocommit. External side effects such as emails or HTTP requests are also outside a database transaction.

## Configuration and errors

The `env` library reads the running process environment:

| Call | Behavior |
| --- | --- |
| `env.get(name, fallback = null)` | Return text or a fallback; preserve an empty string. |
| `env.require(name)` | Require a nonempty value, naming missing configuration in the error. |
| `env.int(name, fallback)` | Require a safe integer; no decimal truncation or empty-string conversion. |
| `env.bool(name, fallback)` | Accept `true`, `false`, `1`, or `0`, case-insensitively. |

Configuration errors do not include the environment value. Codes are `ARYA_ENV_NAME`, `ARYA_ENV_REQUIRED`, and `ARYA_ENV_VALUE`. There is no automatic dotenv loading; export variables or explicitly use a dotenv npm package before reading them.

MySQL errors have stable `error.code` values:

| Code | Action |
| --- | --- |
| `ARYA_MYSQL_CONFIG` | Correct the connection options. |
| `ARYA_MYSQL_DRIVER` | Install `mysql2` in the application project. |
| `ARYA_MYSQL_CONNECT` | Check server access, credentials, database, and TLS configuration. |
| `ARYA_MYSQL_ARGUMENTS` | Use SQL text and a supported positional parameter list. |
| `ARYA_MYSQL_QUERY` | Inspect `error.driverCode` and `error.sqlState`. |
| `ARYA_MYSQL_RESULT` | Use `execute` for writes and row helpers for reads. |
| `ARYA_MYSQL_TRANSACTION` | Check transaction connection/begin/commit failure or use the transaction handle. |
| `ARYA_MYSQL_TRANSACTION_CLOSED` | Finish transaction work inside its callback. |
| `ARYA_MYSQL_CLOSED` | Use an open pool. |
| `ARYA_MYSQL_CLOSE` | Inspect the shutdown failure. |

Driver errors remain available as `error.cause`; public messages omit the driver's SQL and credential text. Keep causes and driver logs in trusted server diagnostics. Client responses should use an application-specific message; the web library's default internal-error response is generic.

Existing `rows`, `execute`, and `close` calls remain supported. Compared with the earlier preview, `connect` now verifies a real connection immediately, parameters are checked, and `rows` requires row results. Use `execute` for write-result packets. These changes are included in alpha.4; older published archives retain their original behavior.

## Example and verification

The [task API example](../fixtures/examples/mysql/README.md) includes a database schema, runtime input schemas, transaction-backed creation with an audit row, parameter routes, separate liveness/readiness endpoints, structured request logs, and controlled shutdown. See the [service guide](services.md). VS Code snippets are `mysqlconnect`, `mysqlrows`, and `mysqltransaction`. The extension and LSP suggest standard-library members, immutable local MySQL pool methods, and inline transaction-handle methods after a dot. These are same-file hints, not general type checking or arbitrary dependency API completion.

`npm run check` runs the unit/adapter suite without a database. To exercise an actual disposable MySQL server:

```sh
npm ci --prefix fixtures/examples/mysql --ignore-scripts
export ARYA_MYSQL_TEST_CONFIG='{"host":"127.0.0.1","user":"arya","password":"test-only","database":"arya_test"}'
npm run test:mysql
```

The integration test creates a temporary InnoDB table on its single pooled session and checks prepared values, exact large numbers, commit, rollback, pool reuse, and shutdown. The dedicated MySQL CI workflow supplies a disposable MySQL 8.4 service.
