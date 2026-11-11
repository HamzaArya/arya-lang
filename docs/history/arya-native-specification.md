# Arya native profile contract

> Historical native documentation. The Node.js-only 1.3 source line retires this compiler/profile. Use [runtime and migration](../node-runtime.md) for current development; the implementation described below remains in [the historical source](https://github.com/HamzaArya/arya-lang/tree/1d3d553826f6dc1f67c6a1f9a7a9f8955a23cfda). Results and commands below apply only to their older versions.


**Historical implementation:** 1.2.0-alpha.4, retaining the 1.1.0-alpha.1 baseline and the 1.2 amendments below. Experimental and separate from the [Node profile](../arya-specification.md). The native compiler and runtime implement this profile; future alpha changes require conformance tests and migration notes.

## Syntax and compilation

Source uses the existing Arya lexer/grammar with one additive import provider:

```text
Import := "use" ("arya" | "std") String "as" Name end
```

`std` is contextual: `let std = 1` remains valid. Native library names are io, fs, math, process, path, and runtime. Arya imports are relative, slash-separated paths ending in `.arya`, resolved canonically inside the entry directory. Import graphs reject cycles and missing exports. Functions and initialized bindings may be exported; namespaces expose live, read-only exports.

The TypeScript entry point shares its AST/parser and resolver with JS emission. The self-hosted entry point implements the native grammar in Arya. Both are tested with the same runnable conformance examples. Checking parses/resolves/emits in memory and does not execute user code, invoke a C compiler, or write output. Existing JS compiler API forms retain their behavior; `arya-language/native` exports the native API.

The native CLI handles check/build/run, output/compiler selection, optimization selection, and literal program arguments. The npm CLI additionally offers sanitizer builds. An installed C11 compiler, linker, and platform SDK are build dependencies, not application runtime dependencies. Native Windows/cross-target builds are not qualified by this profile.

## Values and evaluation

Values include binary64 numbers, UTF-16 strings, booleans, null, undefined, lists, records, and functions. Uninitialized bindings are a distinct internal state. Native values do not contain JavaScript host objects, prototypes, accessors, proxies, BigInt, Symbol, or promises.

Operands and arguments evaluate left-to-right. Compound-assignment receivers/indexes evaluate once. `and` and `or` short-circuit and return operand values. Truthiness follows the shared primitive rules: zero, NaN, false, null, undefined, and empty strings are false; lists and records are true.

Arithmetic preserves binary64 numbers, infinities, NaN and signed zero. Division by zero does not throw. Equality is strict for primitives and uses identity for lists, records, and functions. String equality compares code units. Unary operators bind before exponentiation; `-2 ** 2` is 4 and exponentiation associates right-to-left. Unsafe fast-math transformations are disabled.

`+` concatenates when a string/list/record requires primitive string conversion; otherwise it adds numeric conversions. Native records convert to `[object Object]`, functions to `[function]`, and lists to comma-separated primitive conversions. Object conversion hooks are unsupported. Numeric formatting finds a shortest significant-digit roundtrip representation and normalizes decimal/exponent placement. Exact host-console formatting and every ECMAScript object-conversion edge case are not part of native compatibility.

String length/indexing use UTF-16 code units; string iteration yields code points. Text I/O uses UTF-8, replaces malformed input and lone output surrogates with U+FFFD, and preserves embedded NUL in text data. Filesystem/process path arguments must not contain NUL. String trim/case helpers currently operate on ASCII whitespace/letters; full Unicode case mapping is not implemented.

Lists are mutable zero-based arrays; holes read as undefined, negative indexes do not wrap, and length/index writes are checked. Native list length/index writes are capped at 10,000,000. Records are mutable maps with own string keys; `__proto__` is ordinary data. Nonstring record keys throw. Missing members return undefined. Accessing null/undefined throws a catchable TypeError. Module namespaces reject mutation.

Native supported methods are list push/pop/join/slice/includes/indexOf and string slice/includes/indexOf/split/trim/toUpperCase/toLowerCase. Only the documented basic arguments are supported; arbitrary prototype methods and additional host overloads are not supplied. Push accepts multiple values, slice accepts start/end, join a separator, and split a separator. Includes/indexOf search from the beginning.

## Scope, functions, and failures

Lexical scopes, function hoisting, const assignment checks, temporal dead zones, mutable closure captures, recursion, and fresh for-loop bindings follow the shared core rules. Parameters omitted at calls are undefined; extra arguments are evaluated and permitted. Bare/fallthrough returns produce undefined. Function identity is preserved. Closures keep their lexical environments alive.

`throw` accepts any value and `catch` receives that value. Runtime faults produce a record with name/message. Error propagation uses an explicit checked ABI. Uncaught failures print original source frames and exit 1. Normal completion exits 0. Fatal allocation exhaustion exits 70. Calls are limited to 512 active calls so the runtime can report a RangeError; generated temporary arrays are heap allocated and explicitly rooted.

Numeric specialization is semantics-preserving and guarded by actual numeric arguments. Inconclusive type information uses a dynamic fallback. Capturing closures, side-effectful expressions, and boolean-valued returns are not silently converted to numeric functions. No source-level type or integer-overflow policy is introduced by specialization.

Managed memory uses explicit roots and a precise, nonmoving mark/sweep collector. Cyclic records/lists/closures are collected. Marking is iterative. Files/processes are released deterministically by their standard-library calls. GC finalizers do not close resources. GC pauses and throughput are not real-time guarantees.

## Built-ins

| Name | Contract |
| --- | --- |
| print(...values) | Print primitive conversions separated by spaces and a newline; return undefined. |
| len(value) | UTF-16 string length or list length; otherwise TypeError. |
| str(value) | Native primitive string conversion; omitted argument is undefined. |
| number(value) | Native numeric conversion of the first value; null/empty text are zero, undefined/invalid text are NaN. |
| range(end) / range(start,end,step) | Fresh exclusive-end integer list; safe integer bounds, nonzero step, at most 100,000 values. |
| args | Mutable list of application argument strings. |

undefined, NaN, and Infinity are the only bare host-like constants available in this profile. Their names may be shadowed by lexical bindings. Other host globals receive ARYA_NATIVE_UNSUPPORTED diagnostics in the shared compiler/editor.

## Standard library

| Import | Members and behavior |
| --- | --- |
| io | print(...values), write(value) with flushing, readLine() returning a line without its newline or null at EOF. |
| fs | readText(path), writeText(path,text), appendText(path,text), exists(path), makeDirectory(path) recursively, rename(from,to), remove(path), tempDirectory(template) with an XXXXXX suffix, removeDirectory(path) for an empty directory. Text reads are limited to 16 MiB. Operations raise IOError on OS failures. exists tests whether the path can be opened for reading; it is not a general metadata API. |
| math | sqrt, abs, floor, ceil, round, pow, sin, cos, min, max; constants PI and E. Inputs use native numeric conversion; no random-number API is implied. |
| process | run([executable,...args]) synchronously inherits standard streams and returns the exit status; exit(code); env(name) returning text or null; cwd(); executable(). No shell expansion. |
| path | join(...parts), dirname(path), basename(path), resolve(...parts) from cwd, realPath(path) for an existing canonical path. POSIX paths are the qualified native form. |
| runtime | clock() for process CPU seconds, collect() returning current logical managed bytes after collection, codeUnit(text,index) returning a UTF-16 code unit or NaN outside the string. |

The runtime is not an execution sandbox. Native file/process APIs operate with the application's OS privileges. AryaCode independently enforces trust, workspace containment of source/build artifacts, process cancellation, and deadlines.

## Build and qualification boundaries

The shared compiler bounds sources to 256 KiB and 50,000 tokens per file and projects to 1,024 modules/16 MiB. Parser nesting is bounded. The self-hosted compiler checks source length in UTF-16 units; the npm CLI additionally enforces its existing UTF-8 byte bound. The native specification does not promise arbitrary unbounded source or allocation sizes.

The npm builder stages owned output, validates symlink boundaries, publishes only after compiler/linker success, and rolls back on publication failure. The self-hosted compiler writes a C sidecar and stages the executable before rename; its standalone CLI operates on explicitly selected local paths and is not the IDE's trusted build service. A failed build never invokes a previous executable. Keep generated output paths separate from personal source/data.

Bootstrap qualification requires three generations, identical generated C for generations 2/3, native conformance results, rejected invalid input, and an executable that works without Node. Cross-platform support requires actual target job evidence; a workflow definition alone is not evidence of a successful run.


## Arya 1.2 preview scope

The `1.2.0-alpha.1` native profile adds the branded spellings `keep`, `task`, `when`/`otherwise`, `each`, `give`, and the `say` built-in. These have the same semantics as `const`, `fn`, `if`/`else`, `for`, `return`, and `print`; existing spellings remain accepted. `async task` parses like `async fn` but remains unsupported for native execution. The six new keywords are reserved, and an older binding using one must be renamed. A prior module-level `say` binding also requires a new name. See the [migration note](../releases/1.2.0-alpha.1.md).

Use `fn`/`return` and `if`/`else if`/`else` in new native programs. `task`/`give` and `when`/`otherwise` remain accepted compatibility aliases, matching the Node profile.

Raw triple-double-quoted multiline strings are part of the shared source grammar. They preserve their contents without interpolation or ordinary-string backslash escapes.

The new `view` web grammar and the JavaScript profile's web/MySQL helpers are outside native execution. Native checking rejects them rather than falling back to Node or silently emitting incomplete web code. `use std "fs"` and `use std "math"` retain the native APIs documented above; the Node profile's asynchronous file methods and full host Math object do not change them. Native source builds still require a C11 toolchain, and native executables still run without Node.


## Safe expressions in 1.2.0-alpha.4

The TypeScript-hosted and self-hosted native compilers support nullish coalescing (`??`), optional property/index/call chains (`?.`), and leading-dot multiline chains as specified in the [syntax contract](../syntax-and-debugging.md). Nullish checks distinguish null/undefined from zero, false, and empty strings. Skipped indexes/arguments do not execute; grouping ends the continuous optional chain. Native numeric specialization falls back to dynamic emission for these new operations. The shared safe-access fixture is verified under garbage-collection stress and through bootstrap stages. The JavaScript-only debug library does not expand the native library set.
