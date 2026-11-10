# Process a batch in one Python call

Copy this directory into a writable project. Install the Arya compiler archive locally, then run:

```sh
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/arya-language-<version>.tgz
npx --no-install arya run main.arya
```

Python must be available as `python3` (`python` on Windows). Set `ARYA_PYTHON` to the full interpreter path when using a virtual environment or another interpreter. This example uses only the Python standard language; no Python packages need installation.

The result on stdout is:

```json
{"count":4,"sum":100,"mean":25,"doubled":[20,40,60,80]}
```

`processed one batch` appears on stderr as ordinary Python logging. `summarize` receives all four inputs in one call and computes all results inside that process. A loop around a Python call would start a fresh process for every iteration. Module state does not survive calls, so return all required results as JSON data instead.

The `.py` path is relative to the Arya source file. Arguments/results must be JSON-compatible finite values; encode exact large integers and decimals as strings. Calls are synchronous, capped at 30 seconds, and have 8 MiB stdout/stderr buffers. Return compact results and limit logging.

Arya 1.2.0-alpha.4 also provides `python.map` for ordered batch calls and `python.bind`/`call` for nonblocking execution. See the [async Python guide](../../../docs/python-async.md). The example above retains its original synchronous behavior.
