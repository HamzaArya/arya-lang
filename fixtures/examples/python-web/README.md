# Python processing with a JavaScript-backed Arya API

This example requires Arya 1.2.0-alpha.4 or later. A request flows through Arya input validation, Python's CSV/statistics libraries, and JavaScript's crypto library. No npm or Python packages are needed beyond Arya, Node.js, and Python 3.

From the repository root:

```sh
npm run build
node dist/cli.cjs run fixtures/examples/python-web/main.arya
```

Startup verifies the selected Python interpreter and logs its version. The server listens on `127.0.0.1:3000`; change it with `PORT`. Ordinary logs are JSON records. `ARYA_PYTHON` selects a Python executable if `python3` (`python` on Windows) is not the one you want.

Send a CSV report:

```sh
curl -X POST http://127.0.0.1:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"csv":"amount\n10\n20\n30\n","column":"amount","digits":2}'
```

The response contains a SHA-256 checksum computed by JavaScript, a summary computed by Python, and the request ID. The summary is:

```json
{"count":3,"total":60,"mean":20,"median":20,"minimum":10,"maximum":30}
```

Input is limited to 200,000 UTF-16 code units of CSV and 10,000 data rows. The schema rejects unknown fields. Invalid CSV values return 422 without exposing Python traceback details. The example uses floating-point statistics; monetary/exact decimal processing needs an explicitly chosen decimal representation.

Python work runs asynchronously with four active calls and up to 32 queued jobs. Deadlines and HTTP disconnects cancel the Python child. A reporting call has a five-second budget, including queue time. `/health/live` stays available while Python works; `/health/ready` verifies interpreter access with a three-second budget. Control+C drains requests, then closes the Python client.

For third-party Python packages, create a virtual environment and install them into that environment. Select it with an absolute `ARYA_PYTHON` path, or change the client configuration to an explicit interpreter path. For example, from this example's directory on Unix:

```sh
python3 -m venv .venv
export ARYA_PYTHON="$PWD/.venv/bin/python"
```

On Windows, the executable is `.venv\Scripts\python.exe`. No interpreter is installed or selected implicitly. See the [async Python guide](../../../docs/python-async.md) for calls, batches, keyword arguments, virtual environments, errors, and cancellation.
