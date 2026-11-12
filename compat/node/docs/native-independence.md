# Independent native compiler migration — 2.0.0-alpha.1

The new native compiler, its runtime and its generated executables run without
Node.js, Python, a JavaScript engine or npm packages. The compiler is written in
Arya and built through an auditable C bootstrap. This is a working migration,
not a claim that every 1.3 library and tool has already been converted.

## Build and use

From the source checkout, install a C11 toolchain and POSIX build tools:

```sh
make native
bin/arya --version
bin/arya build native/tests/fixtures/decimal.arya --output /tmp/arya-decimal --release
/tmp/arya-decimal
make native-test
```

No `npm install`, Node or Python is involved in this build. The first build
compiles the vendored libmpdec dependency locally; no network downloads occur.
The bootstrap builds a seed from C, compiles the Arya-written compiler, upgrades
its generated runtime explicitly, then produces two further generations. Their
generated C must be byte-identical. Source provenance and native dependency pins
are recorded in [the provenance file](../native/PROVENANCE.json).

The C11 backend provides a broad bootstrap path including closures and managed
values. The earlier LLVM preview remains reference work; LLVM lowering from this
independent frontend and production backend comparison are not complete.

The current source includes [function-call optimization](native-function-calls.md):
capture-aware frame storage, direct calls, recursive numeric specialization,
allocation diagnostics and optimized/reference qualification.

`bin/arya` launches the native compiler from a source checkout. A native SDK
archive contains the executable and adjacent `lib` headers/static library; the
launcher and repository are not needed by that installed compiler. Building an
application still requires the host C toolchain and SDK. The resulting application
runs with only ordinary system libraries. Current execution qualification is macOS
ARM64. Linux and Windows require their own exact-revision execution evidence.

## Available behavior

- Native lexer/parser, lexical resolution, relative module loading and live exports.
- Binary64 values, booleans, UTF-16 strings, dense lists, records, dynamic functions,
  closures, recursion, loops, indexed iteration, optional access and exceptions.
- Concise functions, defaults/rest, list/argument spread, pipelines and checked guards.
- Primitive annotations with bounded checking; composite type checking remains open.
- Native exact decimal functions using libmpdec and all nine rounding modes.
- Native collection helpers, JSON parse/stringify, filesystem/path primitives,
  console/process operations and core math. Their remaining API gaps are explicit.

The [migration manifest](../native/manifest.json) is the authoritative port table.
It marks partial and missing APIs, including async, dates/zones, HTTP, MySQL,
validation, logging, security, testing and UI. Unsupported imports fail explicitly;
there is no Node fallback or hidden JavaScript interpreter in native execution.

Ordinary `number` arithmetic still uses binary64. Financial values go through
explicit decimal strings. Decimal operations retain the 1.3 bounded string
contract, 4096-digit context, nine modes and checked number conversion. Number
formatting uses pinned Ryu. Native lists currently remain dense; creating holes
is rejected. General Unicode case mapping, console inspection/formatting, async
and finally semantics need further ports and differential tests.

## Publication and data boundaries

`build` publishes a native executable with adjacent `.c` and `.NOTICE` files.
Default publication refuses existing output. `--force` explicitly permits replacing
those generated files. The generated notices include the native dependencies'
licenses and must accompany redistribution. Failed compiler runs remove staging
and cannot publish a partial executable.

Compiler and runtime code can access the host through explicit native filesystem
and process APIs. This is not a sandbox for untrusted programs. Runtime managed
values use a rooted, nonmoving collector; current contexts are single-threaded.
Async scheduling, threaded contexts and public FFI ownership rules remain work.

## Arya Ledger compatibility

Arya Ledger has not been changed. Its pinned Node-based installation remains its
own compatibility path. A native process can exchange JSON messages with Ledger
without making Arya depend on Node. The [calculation-worker example](../native/examples/calculation-worker.arya)
provides a bounded JSON-lines demonstration using exact decimal invoice totals.
It performs no database operations and is not a replacement for Ledger's current
business validation, authorization, transactions or posting logic.

```sh
bin/arya build native/examples/calculation-worker.arya --output /tmp/arya-worker --release
printf '%s\n' '{"id":"one","operation":"invoiceTotals","lines":[{"lineSubtotal":"19.95","taxAmount":"1.50"}]}' | /tmp/arya-worker
```

The retained [Node compatibility implementation](../compat/node/README.md) is not
part of the native build or SDK. It remains available for existing applications
and differential qualification until its required replacements pass their gates.

## Verification

`make native-test` exercises native outputs, collector stress, primitive type and
const diagnostics, live modules, output collisions, relocation, compiler failure
cleanup, system dependencies and ASan/UBSan. It relocates the compiler and SDK,
provides only a C compiler on its executable search path, and builds/runs a decimal
application without Node or Python. macOS leak detection is explicitly not run.

`python3 native/tests/decimal-reference.py` is an optional independent test oracle:
it uses Python's pure-Python decimal implementation for 600 seeded cases. Python
is used only for this reference test, never by the compiler or native programs.
The [migration report](native-independence-report.md) records completed commands,
failures/fixes, artifact identities and the remaining work. No public publication
or stable-release declaration is implied.
