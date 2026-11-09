# JavaScript and Python interoperability

Arya keeps JavaScript values in JavaScript calls and uses JSON data for Python calls. Checking a source file never loads either kind of dependency. Libraries are loaded only when the compiled program executes.

The [npm example](../fixtures/examples/npm/README.md) installs a small local package with npm and calls it by package name. It works offline and uses the same package-resolution path as third-party npm libraries. The [Python batch example](../fixtures/examples/python-batch/README.md) processes a complete list in one Python process. Both examples include exact expected output and installation commands.

## JavaScript behavior

`use js "package-or-path" as library` creates a static Node ESM import. Arya binds `namespace.default ?? namespace`: a non-nullish default is selected, including false, zero, and empty string. With no default or a null/undefined default, the alias is the namespace; an intentional nullish default can be read as `library.default`. CommonJS packages use Node's ESM representation.

Calls preserve callbacks, constructors, promises, method receivers, object identity, and numeric edge values. An absent namespace property reads as undefined. Calling that property throws TypeError; Check does not validate library exports or API shapes. Missing packages retain Node's `ERR_MODULE_NOT_FOUND` loader error. Static dependency loading happens before the Arya module body, so a try/catch around a later call does not catch a missing import. Install packages in the entry project's root/parent `node_modules` chain. Graph output mirrors source folders below one generated root, so an npm dependency installed only in an original nested source folder is not automatically relocated.

Errors thrown by JavaScript library code retain library frames and mapped Arya caller frames when source maps are enabled. `arya run` enables them automatically; standalone builds use `node --enable-source-maps output.mjs`.

## Python behavior

`use python "math" as math` imports an installed module on the first call. A local `.py` specifier is resolved relative to the Arya source, including when generated output is placed elsewhere. `ARYA_PYTHON` selects the executable; otherwise the CLI uses `python3` on macOS/Linux or `python` on Windows. AryaCode can choose its interpreter through editor settings. Install third-party modules in that selected environment, for example with its `python -m pip`, rather than assuming a different terminal interpreter shares the packages.

Each call starts a fresh synchronous process. Python module state, live object identity, and callbacks do not cross calls. Batch work inside one helper to avoid one process launch per item. Public callable members are supported, including dotted paths exposed by a package. Use `function.with([positionalArguments], {keyword: value})` for keyword arguments. The proxy reserves `then` (always undefined) and `with` (the keyword adapter); Python functions with those names need a public helper with another name. Private names beginning `_` are rejected.

Arguments and results must be JSON-compatible data. Undefined, functions, symbols, bigint, nonfinite numbers, and cycles are rejected with TypeError before starting Python. JSON object serialization omits symbol/non-enumerable keys and applies `toJSON`; custom serialization failures are also reported as input errors. Return finite numbers, strings, booleans, None, lists/tuples, or dictionaries containing JSON values. Convert sets, dates, dataframe objects, and other custom types explicitly. Large Python integers may round to JavaScript Number; transport exact integers and decimals as strings. Negative zero sent to Python becomes zero; a returned Python `-0.0` retains its sign.

The bridge forces UTF-8 for its pipe protocol and handles paths/text containing spaces and Unicode. Ordinary Python stdout is redirected to stderr and forwarded as logging. Native code that bypasses Python's stdout object, such as `os.write(1, ...)`, can corrupt the protocol and is rejected. The bridge validates the full JSON response envelope, not merely whether output parses as JSON. It does not put Python traceback objects into protocol responses; exception type and message remain useful.

Calls have a 30-second timeout and 8 MiB stdout/stderr buffers. Reduce work or batch size when a call times out. Limit logging and return compact results when output exceeds a buffer. On a buffer failure, at most 64 KiB of captured stderr is forwarded before the diagnostic so a failed call cannot dump megabytes of logs. There is no persistent worker or async Python transport.

## Stable Python diagnostics

Errors expose a string `error.code` in addition to their readable message and mapped Arya caller. Existing public/private/value/argument message prefixes are retained; some errors now include action hints. All bridge errors are catchable through Arya try/catch.

| Code | Meaning / action |
| --- | --- |
| `ARYA_PYTHON_NOT_FOUND` | Interpreter executable could not start; install Python or set `ARYA_PYTHON`. |
| `ARYA_PYTHON_START` | Other process-start failure; check the executable and permissions. |
| `ARYA_PYTHON_MODULE_NOT_FOUND` | Install the module and dependencies in the selected Python environment. |
| `ARYA_PYTHON_FILE_NOT_FOUND` | Correct the source-relative `.py` path. |
| `ARYA_PYTHON_MEMBER` | Select an existing public callable; wrap constants/objects in a helper. |
| `ARYA_PYTHON_PRIVATE` | The selected proxy member begins with `_`. |
| `ARYA_PYTHON_ARGUMENTS` | `.with` requires a positional list and keyword object. |
| `ARYA_PYTHON_INPUT` | Convert arguments to JSON data, remove cycles, or encode exact numbers as strings. |
| `ARYA_PYTHON_RETURN` | Convert the Python return value to supported finite JSON data. |
| `ARYA_PYTHON_EXCEPTION` | The Python call raised an exception; inspect its type/message. |
| `ARYA_PYTHON_TIMEOUT` | The call exceeded 30 seconds; reduce or split the work. |
| `ARYA_PYTHON_OUTPUT_LIMIT` | A stdout/stderr buffer exceeded 8 MiB; return less data and reduce logs. |
| `ARYA_PYTHON_EXIT` | Python exited unsuccessfully or was terminated; inspect forwarded stderr. |
| `ARYA_PYTHON_PROTOCOL` | Output was truncated, malformed, or not a complete bridge response. |

The [interop regression suite](../tests/interop.test.ts) covers the roadmap's JavaScript/Python matrix. It uses real Python for missing dependencies, exception/data behavior, Unicode, logging, batching, oversized results/logs, and native stdout corruption. Controlled subprocess-boundary results exercise timeout/start/buffer classification quickly while asserting the actual timeout/buffer/UTF-8 options; the suite does not sleep for 30 seconds. Existing source-map tests verify Python and imported JavaScript caller frames as well.

The current bridge preserves the documented synchronous process-per-call behavior and nullish JavaScript default selection. Hardening adds error codes, actionable messages, response-shape validation, and explicit UTF-8 pipes. It does not add a type system, dependency installation, automatic missing-export checks, persistent Python state, or callback/object transport.
