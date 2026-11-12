# Contributing to native Arya

Build with `make native-editor`. The primary implementation is `native/compiler` (Arya frontend and tooling), `native/runtime` (C runtime), and `native/libraries` (Arya standard modules). `bin/arya` launches the checkout's native compiler. The `compat/node` tree preserves the prior implementation and does not participate in native builds.

Run `make native-test` for core execution, publication safety, the financial protocol and optimized/reference function calls. Run `make native-profile-test` for standard-library ASan/UBSan and collector-stress checks. `make native-clean-test` rebuilds a source-only snapshot, excludes Node/Python from PATH, compares compiler generations, packages the full SDK and builds/runs relocated applications. Keep those tools absent from native build scripts.

Optional independent controllers use Python as a test oracle:

```sh
python3 native/tests/decimal-reference.py
python3 native/tests/accounting-reference.py
python3 native/tests/types-reference.py .build/independent/arya
python3 native/tests/lsp-reference.py .build/independent/arya
python3 native/tests/project-reference.py .build/independent/arya
```

For compiler-call work, `make native-call-test` compares advanced, previous
and reference call paths. `python3 native/tests/benchmark-calls.py` is an optional
measurement controller; its `--baseline` option accepts a retained native compiler.

Live MySQL tests must initialize their own private data directory and socket with `--no-defaults`. Never reuse a developer or Ledger database. Python, desktop and editor integration checks are explicit optional gates; the editor host runs with an isolated profile and extensions directory.

The historical C seed accepts a smaller source syntax. Compiler implementation modules must avoid default parameter syntax, indexed `for ... at`, direct host globals, reserved words as binding names, and `try` without `catch`. User programs support the complete documented native syntax, including `finally`. Bootstrap changes need three-generation convergence and an updated provenance hash.

Preserve existing release archives. The package script refuses to overwrite archives or checksums. Record measured results with hardware, compiler flags, precision, workload, and reference implementation; do not infer universal performance rankings from a kernel benchmark. The [native profile](docs/native-profile.md) defines the supported contract.
