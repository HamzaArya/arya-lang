# Native independence qualification

Arya 2.0.0-alpha.2 completes the native execution migration on the qualified macOS ARM64 platform. The self-hosted compiler, runtime, all 18 previous standard modules, native tooling, accounting and added money/finance/CSV modules use native code. There are 26 public native modules. No Node, npm, Python interpreter or embedded JavaScript engine is required for core compilation or execution.

The retained 1.3 implementation is preserved under compat/node for existing consumers. Existing installed Arya Ledger packages and data were not changed. JavaScript module imports/output remain a separate compatibility profile; the native financial worker supplies an explicit JSON-lines integration. Python interoperability launches Python only when invoked. The editor supplies its own extension host, which transports requests to a native language server.

| Gate | Qualified result |
| --- | --- |
| Source bootstrap | Retained C seed, current-runtime stage-one rebase, three native generations, identical stage-two/stage-three C |
| Interpreter independence | Source-only workspace with Node/Python/Bun/Deno absent from PATH; full SDK built and tested there |
| Runtime conformance | Core output, native modules/live exports, safe publication, failure cleanup, typed calls and financial protocol |
| Calls and data | 53 general call checks, 47 advanced call checks, 36 data lifetime/order checks; optimized/comparison modes, release/debug, ASan/UBSan and collector stress |
| Standard modules | All runtime profile groups, parsed decimals/Money, prepared finance, indexed collections, CSV backpressure and one-byte UTF-8/NUL input |
| Independent exact arithmetic | 5352 string/parsed-decimal results against Python _pydecimal; 85 invoice/ledger batches covering 7600 rows against independent Decimal/integer models |
| Large accounting | 100000-row prepared invoices/ledgers, wide exact totals, ownership, yielding and cancellation under sanitizers |
| Paths/globs | 3254 portable POSIX/Win32 reference cases plus dynamic CWD invariants; 4368 native glob cases |
| Types/language service | 105 independent flow/alias/closure cases; LSP navigation, safe rename, recovery, incomplete member chains, nested signatures, untitled URIs and workspace boundaries |
| Projects | All five templates, live web/API/UI requests, exact totals, SIGTERM drain, safe creation/init/races, cache invalidation and five isolated editor launchers |
| Editor | Actual VSIX installation in an isolated profile; nine providers using the bundled native SDK without a compiler override |
| Optional integrations | HTTP framing/chunks/pipelining/deadlines/shutdown; explicit Python bridge; private fresh MySQL instance; macOS AppKit/WebKit route/load/close |
| Distribution | Full relocated SDK, executable symlink resource lookup, spaces/apostrophes in paths, file checksums, native feature builds and direct execution with PATH=/nonexistent |
| Preservation | 825 original source/document files and 9278 cache files preserved; all 186 previous artifact files unchanged |

The qualification record and source hashes are under native/qualification. SDK files have their own SHA256SUMS. The retained seed and third-party inputs match native/PROVENANCE.json. Historical alpha.1 artifacts remain immutable and describe their earlier, smaller scope.

## Measured accounting workload

On an Apple M1 with 8 GiB RAM, three interleaved fresh-process samples prepared 100000 identical exact line-v1 invoice rows and calculated the batch five times. The native median was 45.42 ms for the process and 14.50 MiB peak RSS, versus 243.32 ms and 60.70 MiB for the retained Node BigInt implementation. The retained Node native addon took 216.37 ms and 59.56 MiB. Prepared calculation time was 20.03 ms native and 21.40 ms for the Node native addon.

Twenty-process hello startup medians were 4.77 ms native and 39.90 ms Node. The native hello executable was 366968 bytes; the accounting executable was 574456 bytes. These are single-host measurements during development load, with identical precision/policy, rather than universal performance claims. Raw samples, flags, hashes and hardware are in docs/benchmarks/2.0.0-alpha.2-accounting-qualified.json.

## Profile limits

This is an alpha native language profile. Windows, Linux release qualification, other CPU release artifacts, cross-compilation and Wasm need separate gates. The native host-style APIs are bounded compatibility subsets, not a full JavaScript environment. The HTTP server is HTTP/1 without built-in TLS; MySQL needs its external native client SDK. Desktop hosting currently targets macOS.

Filesystem promise APIs yield before bounded synchronous I/O, which can occupy the cooperative main thread. Broader CPU parallelism, background filesystem workers, a stable public embedding ABI, a native debug adapter and registry tooling belong to professionalization work. macOS leak detection was not qualified. See native-profile.md for exact numeric/resource/foreign-boundary contracts.
