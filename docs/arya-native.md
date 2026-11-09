# Native Arya 1.1 preview

Arya has a C11 native backend and an Arya-written native compiler. Native programs compile ahead of time to machine-code executables. They run without Node.js, Python, an Arya installation, a C compiler, or a JavaScript engine. OS libraries remain dependencies; the macOS arm64 artifact links to libSystem.

This is **1.1.0-alpha.1**, an experimental release. It does not declare the preceding stable 1.0 qualification complete. Platform support is limited to environments recorded in the release's qualification evidence. See the [native contract](arya-native-specification.md) and [implementation plan](arya-1.1-native-plan.md).

## Build a calculator

The npm compiler requires Node.js 22.15+ and a C11 toolchain (Apple Command Line Tools on macOS, GCC or Clang plus development libraries on Linux):

```sh
npm install arya-language@next
npx arya build calculator.arya --target native -o build/calculator
./build/calculator 12 + 8
```

The [complete calculator](../fixtures/native/calculator.arya) accepts arguments or prompts interactively. A minimal program is:

```arya
use std "io" as io
io.write("Your name: ")
let name = io.readLine()
print("Hello, " + name)
```

Check never runs source or invokes a compiler:

```sh
npx arya check calculator.arya --target native
npx arya run calculator.arya --target native -- 12 + 8
```

Use `--cc /path/to/clang` or ARYA_CC to select the compiler executable. `--debug` selects unoptimized code; `--release` selects optimized code (the default). `--sanitize` enables address/undefined-behavior sanitizers for development. Runtime errors retain original Arya file/line/UTF-16 column information independently of C debug symbols. Interactive debugging is not supplied by this alpha.

The default npm CLI target remains JavaScript. `use js` and `use python` belong to that profile and produce targeted errors in native checking. `use std` belongs to native execution. Put flags before `--`; every later argument is passed literally to the program.

## Use the self-hosted compiler

The native release archive supplies `arya-native`, legal notices, and BOOTSTRAP.json. Extract it and run:

```sh
./arya-native --version
./arya-native check main.arya
./arya-native build main.arya -o build/main
./arya-native run main.arya -- argument
```

This compiler runs without Node.js. It still invokes an installed C11 compiler/linker to build executables. A compiler written in Arya does not replace the operating system's SDK, linker, or C toolchain.

The [compiler source](../bootstrap/compiler.arya) implements lexing, parsing, lexical resolution, module loading, C emission, numeric specialization, and a CLI in Arya. It embeds the C runtime through a generated Arya module. It does not invoke the TypeScript compiler or Node at runtime. The bootstrap command uses the TypeScript compiler only for the initial generation:

```sh
npm run bootstrap:native
```

This builds generation 1, uses it to compile generation 2, and uses generation 2 to compile generation 3 with a PATH that excludes the development Node installation. It compares generation 2/3 generated C byte-for-byte, runs calculator and conformance programs through the native compiler, and checks rejection of a const write. `.build/bootstrap-native/evidence.json` records source/runtime/binary hashes and results. Matching generated C is the bootstrap convergence check; identical binaries across distinct platform toolchains are not promised.

## Standard libraries

Native imports use a contextual provider without reserving `std` as a variable name:

```arya
use std "fs" as fs
use std "math" as math
use std "path" as path
use std "process" as process
use std "runtime" as runtime

fs.writeText("report.txt", "Ready\n")
print(math.sqrt(81), path.resolve("report.txt"))
```

See the contract for precise APIs and limits. `process.run` receives an argument list and invokes the executable directly, with inherited standard streams. It does not interpret shell syntax.

## AryaCode and portable editors

In AryaCode, set `arya.language.target` to `native`. Normal Run and Build then compile a contained native executable through the selected C toolchain; tool execution retains workspace trust, cancellation, and process deadlines. `js` preserves the previous runner. Select a C compiler with the existing `arya.tools.cc` setting or use the available bundled Zig C driver.

In the portable VS Code extension, use `aryaLanguage.target` and optionally `aryaLanguage.ccPath`. The portable LSP accepts `initializationOptions.target = "native"` or `workspace/didChangeConfiguration` with `{arya:{target:"native"}}` for profile-specific diagnostics. Analysis remains passive.

## Performance and limitations

Both compilers specialize eligible functions whose parameters, arithmetic, local variables, and returns are proven numeric. Those functions use C doubles and direct arithmetic; argument guards retain a dynamic fallback. Closures, general records, and genuinely dynamic operations use the managed runtime. No source type annotations or manual memory syntax are required.

`node scripts/benchmark-native.mjs` records a runtime-input numeric-loop comparison against handwritten optimized C and JavaScript, including all samples, process startup, build time, compiler version, and binary size. Its recorded regression budget is 4× the handwritten C median for that workload. This is a regression guard, not a claim about every program or workload.

The runtime uses a precise nonmoving mark/sweep collector with explicit generated roots, managed closure environments, and iterative graph marking. It has no third-party collector dependency. Set ARYA_GC_STRESS=1 to collect before each managed allocation and ARYA_GC_STATS=1 to report logical heap statistics at shutdown.

This native profile targets command-line applications. GUI frameworks, async/await, threads, networking libraries, arbitrary C ABI imports, npm/Python imports, Windows native execution, cross-compilation, user-visible static types, and interactive debugging remain outside this release. A limited native standard library should not be presented as compatibility with every Node API.
