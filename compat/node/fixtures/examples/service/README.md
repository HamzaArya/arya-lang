# Arya service example

This example requires Arya 1.2.0-alpha.4 or later. It separates startup, handlers, and schemas into readable Arya modules. It needs Node.js 22.15+ and no third-party runtime dependencies.

From the repository root:

```sh
npm run build
node dist/cli.cjs run fixtures/examples/service/main.arya
```

The server listens on `127.0.0.1:3000` and writes one JSON record per log line. `PORT`, `LOG_LEVEL`, and `REQUEST_DEADLINE_MS` are optional environment settings; `.env` files are not loaded automatically.

```sh
curl -i http://127.0.0.1:3000/health/live
curl -i http://127.0.0.1:3000/health/ready
curl -i 'http://127.0.0.1:3000/api/greet/Hamza?punctuation=.'

curl -i -X POST http://127.0.0.1:3000/api/echo \
  -H 'Content-Type: application/json' \
  -d '{"message":"  Hello from Arya  "}'
```

The echo response contains trimmed text and the request ID also returned in `x-request-id`. An empty message or unknown request field produces a 400 response with field paths. Handler and access logs use the same request ID. Access logs omit query values, headers, and bodies.

Control+C drains requests before stopping, with a 10-second deadline. Replace the readiness check with actual dependencies such as `db.ping()` when adding a database; this example's check only reports its own service state.

See [service APIs](../../../docs/services.md) and the [MySQL example](../mysql/README.md) for a database-backed application.
