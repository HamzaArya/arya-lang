# Native language profile

Arya's native implementation provides 28 public standard modules through C/Arya implementations, including all 18 modules from the retained source profile. It includes native process/runtime helpers, authentication with macOS biometric/Keychain integration, project tooling, direct native GUI controls, desktop hosting, fixed-point accounting, parsed decimal values, money/finance policies and incremental CSV decoding. Record composition added in 2.0.0-alpha.3 remains part of the 2.0.0 grammar. The retained 1.3 implementation provides JavaScript module output and Node package imports separately.

## Language and numeric behavior

The native frontend supports records, sparse/dense lists, UTF-16 text, lexical functions/closures, live Arya module exports, default/rest parameters, spread, pipelines, guards, loops (including indexed `for`), exceptions/finally, async functions, promises and gradual type annotations. The checker tracks nullable values, array/record/function contracts, unions, branch narrowing, mutable aliases and call/await effects. Unannotated programs remain dynamic. Unknown foreign values need validation before typed use; an explicit foreign import ascription is a trusted contract.

Record literals support `{name}`, `{[stringKey]: value}` and `{...record}`. Fields evaluate in order; computed keys are validated before their values. Spread accepts records only, snapshots stored keys and shallow-copies current values. Getters run once per copied key and produce ordinary mutable fields; nested references remain shared. This is Arya's record model, not JavaScript prototype/descriptor copying. Known record fields retain structural inference; dynamic keys or `any`/union spreads conservatively produce `any`. The [language reference](arya-language.md) defines the syntax and its type-checking limits.

Ordinary numbers are binary64, including signed zero, NaN and infinities. Integer-looking `number` expressions are not arbitrary-precision integers. Decimal operations accept canonical exact strings with a 4096-digit context, 1024-character I/O bound, 0–100 output places and nine explicit rounding rules. Fixed-point accounting checks signed 64-bit line amounts and uses signed 128-bit products and aggregates, with at most one million rows, 100000 accounts, scales 0–6 and two active asynchronous jobs. The accounting C implementation requires a compiler supporting `__int128`.

Strings use UTF-16 indexing and Unicode 17 default case mappings. Buffers are bounded byte views. RegExp uses PCRE2's 16-bit Unicode engine with bounded matching and no JIT; ECMAScript-only syntax/semantics are not an interchangeable contract. POSIX and Win32 lexical path profiles have independent reference cases. URL parsing uses Ada.

## Host-style compatibility values

These helpers are native implementations, not an embedded JavaScript engine. Supported operations are defined by native code and the acceptance fixtures:

| Value | Native contract |
| --- | --- |
| Object / Array | Record keys/entries/values, assignment and data/accessor helpers; dense/sparse list construction, iteration and collection methods. Getter fields are readonly; complete JavaScript descriptor flags/prototypes and named list properties are outside this profile. |
| Number / String / Boolean / Math | Binary64 conversions/classification, UTF-16 string operations, the 42 Math functions and eight constants in the supported source profile |
| JSON | Parse/stringify, reviver/replacer, indentation and `toJSON`; values cross foreign boundaries as JSON data |
| Map / Set | Native identity/value lookup, insertion order, size, mutation and iteration; no JavaScript prototype hierarchy |
| Buffer | Bounded allocation/from/concat, encodings, shared subarrays, byte indexing and common checked numeric reads/writes; no Node streams or arbitrary typed-array platform |
| Date / datetime | Native timestamps, date conversion and documented date/instant/offset/time-zone operations; not every JavaScript Date prototype method |
| Promise / timers | Cooperative async/await, thenables, combinators, microtasks, timers and bounded task scheduling |
| AbortController / AbortSignal | Native cancellation state, reason, abort listeners and throwIfAborted for bridge/library cancellation |
| URL / URLSearchParams | Native Ada URL parsing, property updates and search-parameter operations |
| Error / console | Structured errors, native source stack frames and bounded inspection/output; Node-specific inspect options and prototype behavior are outside the native contract |

Language services run in the native executable and do not execute imports. The VS Code extension is an editor-host transport. An editor may itself use Electron/Node; running Arya applications and its CLI does not depend on that editor host.

## Execution and platform limits

The runtime uses a tracing collector with explicit C roots. Arya tasks run cooperatively on the main thread; code must yield to allow other tasks to progress. Native workers handle filesystem promise operations and selected crypto/database operations through a shared queue with at most 64 jobs and two running workers. Workers own native buffers; managed values stay on the runtime thread. The scheduler caps live tasks at 512. Calls are bounded to 512 frames, strings to 16 Mi UTF-16 units, buffers to 16 MiB, and a project to 1024 modules/16 Mi UTF-16 source units. Additional service limits are enforced by their APIs.

Filesystem promises for reading/writing text, listing directories and checking existence perform their blocking system calls on native workers, leaving timers and other Arya tasks runnable. Synchronous filesystem APIs and stdin/stdout operations can still occupy the main thread. CPU-intensive Arya callbacks remain cooperative.

High-index list writes reserve demand-zero address space and track the pages containing values, so holes require neither dense allocation nor a full-length collector scan. Bulk list mutators can materialize dense storage within the existing length limits. Memory counters count tracked sparse pages and metadata rather than the whole virtual reservation. Strings remain immutable; appends can share unused buffer capacity beyond an earlier value's immutable prefix.

Qualified release targets are recorded in `native/manifest.json`: macOS ARM64, Ubuntu 24.04 Linux x64 and Windows x64 with Cygwin passed their native SDK gates. Other architectures, older Linux libc/GTK combinations, cross-compilation and Wasm are not qualified. Windows applications require the matching Cygwin runtime. The optional desktop host is macOS AppKit/WebKit. The HTTP server is HTTP/1 without built-in TLS. MySQL needs a separately supplied native client SDK. Python starts only for explicit interoperability; that optional bridge is unsupported on Windows/Cygwin in 2.0.0.

`use arya` loads Arya modules. `use python` and `std "python"` use the explicit native bridge. `use js`, npm package imports, generated JavaScript, a stable public C embedding ABI, and a native debug adapter are not supplied by this native SDK. Existing Node consumers can keep their pinned 1.3 packages or call the native financial worker using JSON lines. No installed Ledger package or data migration is performed by building this repository.

Parsed decimal values use the same bounded libmpdec arithmetic contract as decimal strings. Money values check currency/scale/rounding before combining amounts. The finance module supplies explicit opt-in policies rather than a currency registry or automatic Ledger migration. CSV parser limits and pull-based consumption bound buffering; applications choose their own input normalization and business validation.
