# Native executable preview

The unpublished native preview compiles a deliberately bounded Arya subset into
a real host executable. It reuses the existing lexer, parser, lexical resolution
and optional type checker, lowers to a verified typed intermediate representation,
then emits LLVM IR for Clang to compile and link with a small C++ runtime.

Node.js is needed to run the current compiler frontend. The resulting executable
does not require Node.js or Python. The default JavaScript application workflow
and older native-option migration errors retain their existing behavior; this
preview has its own explicit command and API.

## Build and run

Install a host Clang C++ toolchain with C++17 library support, then from the source
checkout:

```sh
npm ci
npm run build
node dist/cli.cjs native fixtures/examples/native-preview/main.arya --output /tmp/arya-native-example --release
/tmp/arya-native-example
```

Choose a new output path: publication refuses to overwrite existing files.
`--debug` selects the unoptimized/debug build; `--release` selects optimization.
`--compiler /path/to/clang++` selects an explicit compiler executable.
`--sanitize` adds address/undefined-behavior sanitizer instrumentation for local
diagnostics and requires the corresponding toolchain runtime.

Debug mode currently controls optimization and toolchain debug flags. Complete
Arya source-line debug metadata, native breakpoints and native stack-trace mapping
are not yet implemented. Compiler diagnostics and typed IR retain source positions.

The first driver builds for the current host on macOS or Linux. OS/architecture
qualification is recorded by actual execution, not inferred from LLVM target
coverage. Windows, cross-compilation, standalone compiler distribution and Wasm
remain separate milestones.

## Supported language boundary

| Feature | Preview contract |
| --- | --- |
| Numbers | Existing binary64 `number` semantics; arithmetic is not silently converted to integer or money arithmetic |
| Booleans | `true`, `false`, comparisons, `and`/`or` short circuit, `not`/`!` |
| Locals | `const`/`let` number or boolean bindings, lexical scope and same-type assignments |
| Arithmetic | Numeric unary `+`/`-`, binary `+`, `-`, `*`, `/`, `%`; comparisons between supported compatible values |
| Branches and loops | `if`/`else` and `while` with boolean conditions |
| Functions | Top-level direct functions with explicit number/boolean parameter annotations and number/boolean/void result annotations; direct calls and recursion |
| Output | `print` of numbers, booleans and direct string literals, with spacing/newline behavior matching the supported Node output cases |

Unsupported features produce source-located diagnostics. There is no fallback to
JavaScript execution inside a native binary. Imports, npm/Python/standard-library
bridges, captured outer bindings, dynamic functions, arrays/records, general string
values, defaults/rest parameters and async operations are outside this first
subset. A number-returning function must return on every continuing path.

The current Node `print` uses console formatting when its first string argument
contains `%` and further arguments follow. Native preview rejects that form
explicitly; single-argument literal `print("%s")` is supported.

Binary64 retains its normal rounding, signed zero, NaN, infinity and underflow
behavior. This backend does not turn ordinary `number` values into exact financial
values. The independent [accounting library](accounting-engine.md) retains its
own explicit exact-value contract and currently runs in the Node host.

## Compiler and IR APIs

The source package exposes `arya-language/native-preview`:

```js
import {compileNative, buildNativePreview, verifyNativeIR, serializeNativeIR}
  from 'arya-language/native-preview';

const result = compileNative('const amount: number = 1.5\nprint(amount + 2)', 'main.arya');
verifyNativeIR(result.ir);
console.log(serializeNativeIR(result.ir));

await buildNativePreview('fixtures/examples/native-preview/main.arya', {
  output: '/tmp/my-arya-program',
  mode: 'release'
});
```

`compileNative` is synchronous and passive: source parsing, lowering, verification
and LLVM text emission do not invoke an external compiler or execute application
code. `buildNativePreview` performs the explicit filesystem/toolchain build and
publishes the final executable only after successful compilation. It returns the
output path, typed IR, LLVM text, compiler identity, mode, byte count, SHA-256 and
elapsed build time.

The source API accepts at most 256 KiB, with at most 1,000 functions, 64 parameters or print arguments, bounded structural depth and a bounded text/data budget in the IR verifier.

The IR has an explicit version and scalar types, resolved binding/function
identities, source locations, calls, assignments and structured control flow. Its
verifier rejects malformed input before code generation. Deterministic IR text
is an inspection/testing format; no stable serialized-IR compatibility promise is
made by this preview.

## Runtime and qualification

Scalar locals use native stack storage. This subset has no language-managed heap
objects, closures or garbage collector; it does not impose ownership syntax on
existing Arya programs. Recursion consumes the host stack. The small output
runtime uses the platform C/C++ libraries, so these executables are not advertised
as fully static binaries. Broad native lifetime, concurrency, diagnostics and FFI
contracts require later runtime milestones.

Run the focused native checks after building the package:

```sh
npm run test:native-preview
```

The focused runner requires native toolchain execution. The ordinary repository
suite runs passive lowering/verifier tests and explicitly skips SDK-dependent
cases unless `ARYA_TEST_NATIVE_PREVIEW=1` is set. Tests compare the existing JS
backend with debug/release native output, including numeric edges, seeded
arithmetic, effect order, strings, recursion and loops. They also relocate a
binary, remove its source, run it with an empty `PATH`, inspect its native file
header and linked libraries, and exercise publication failures.

LLVM is the first working preview backend. This implementation does not complete
the planned production LLVM/Cranelift/backend comparison or establish universal
performance superiority. See the [target architecture](architecture-target.md)
and [implementation roadmap](implementation-roadmap.md) for subsequent gates.
