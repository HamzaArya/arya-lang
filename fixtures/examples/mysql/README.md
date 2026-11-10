# Arya task API with MySQL

This example requires Arya 1.2.0-alpha.4 or later. It uses schemas, structured logs, request correlation, and controlled shutdown. It provides these endpoints:

- `GET /api/health` checks database connectivity.
- `GET /health/live` reports liveness; `GET /health/ready` checks MySQL with a readiness deadline.
- `GET /api/tasks/:id` fetches one task or returns a structured 404.
- `GET /api/tasks` returns the most recent 100 tasks.
- `POST /api/tasks` validates a title and saves a task plus its audit event in one transaction.

From the repository root:

```sh
npm run build
npm ci --prefix fixtures/examples/mysql --ignore-scripts
```

Create a database and an application account on your MySQL server. Apply [schema.sql](schema.sql) to that database using your normal database administration tool. Both tables use InnoDB. The example does not create databases or apply schema changes on startup.

Configure the application using environment variables. `DB_USER` and `DB_NAME` are required; other values have defaults:

```sh
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_USER=arya
export DB_NAME=arya_app
# Set DB_PASSWORD in your terminal or deployment secret configuration.

node dist/cli.cjs run fixtures/examples/mysql/main.arya
```

`PORT` defaults to 3000; `LOG_LEVEL` defaults to info. Logs are JSON records with request IDs, and each response includes `x-request-id`. Set `DB_SOCKET` when connecting through a local MySQL Unix socket instead of TCP. With a suitable released compiler installed on PATH, the equivalent command from this directory is `arya run main.arya`. A `.env` file is not loaded automatically.

Try the API:

```sh
curl http://127.0.0.1:3000/api/health

curl -X POST http://127.0.0.1:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Build something useful"}'

curl http://127.0.0.1:3000/api/tasks
```

Stop with Control+C. Shutdown stops accepting requests, finishes active requests, then closes the database pool, with a 10-second overall deadline. The server listens on loopback by default. This is a focused database/API example; authentication, deployment TLS, and application-specific access rules belong in a deployed application.

See the [MySQL guide](../../../docs/mysql.md) for connection settings, TLS, exact numeric results, transaction behavior, and error codes.
