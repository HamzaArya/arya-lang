# Contributing to native Arya

Build the standalone SDK with `make native-sdk`. Build the optional editor-host adapter separately with `make native-editor`. The primary implementation is `native/compiler` (Arya frontend and tooling), `native/runtime` (C runtime), and `native/libraries` (Arya standard modules). `bin/arya` launches the checkout's native compiler. The `compat/node` tree preserves the prior implementation and does not participate in native builds.

Run `make native-test` for core execution, publication safety, the financial protocol and optimized/reference function calls. Run `make native-profile-test` for standard-library ASan/UBSan and collector-stress checks. `make native-clean-test` rebuilds a source-only snapshot, excludes Node/Python from PATH, compares compiler generations, packages the standalone SDK (without editor-host JavaScript) and builds/runs relocated applications. Keep those tools absent from native build scripts.

Optional independent controllers use Python as a test oracle:

```sh
python3 native/tests/decimal-reference.py
python3 native/tests/accounting-reference.py
python3 native/tests/types-reference.py .build/independent/arya
python3 native/tests/lsp-reference.py .build/independent/arya
python3 native/tests/project-reference.py .build/independent/arya
python3 native/tests/docs-reference.py
```

For compiler-call work, `make native-call-test` compares advanced, previous
and reference call paths. `python3 native/tests/benchmark-calls.py` is an optional
measurement controller; its `--baseline` option accepts a retained native compiler.

Live MySQL tests must initialize their own private data directory and socket with `--no-defaults`. Never reuse a developer or Ledger database. Python, desktop and editor integration checks are explicit optional gates; the editor host runs with an isolated profile and extensions directory.

The historical C seed accepts a smaller source syntax. Compiler implementation modules must avoid default parameter syntax, indexed `for ... at`, direct host globals, record shorthand/computed keys/spread, reserved words as binding names, and `try` without `catch`. User programs support the documented native syntax, including record composition and `finally`. Adding a frontend feature does not require writing the compiler itself in that feature. Bootstrap changes need three-generation convergence and an updated provenance hash.

Record syntax acceptance is `sh native/tests/record-literals.sh` and is included in `make check`. It covers source behavior, GC/sanitizers, getter effects, aliasing, type rejection and formatting. Keep editor traversal and rename behavior in sync with new AST nodes; run the optional type/LSP references for checker and language-service changes. The current documentation catalog is `native/DOCUMENTATION`; update it when adding a shipped guide and check both repository and staged SDK links with the optional docs controller.

Preserve existing release archives. The package script refuses to overwrite archives or checksums. Record measured results with hardware, compiler flags, precision, workload, and reference implementation; do not infer universal performance rankings from a kernel benchmark. The [native profile](docs/native-profile.md) defines the supported contract.

Run `python3 native/tests/parser-fuzz.py --compiler .build/independent/arya` for deterministic malformed-source robustness checks, and `python3 native/tests/number-format-reference.py` for exact binary64 formatting reference checks. These Python controllers are optional test dependencies; neither is used by native builds or generated programs. `make check` runs native runtime, sanitizer and distribution gates.
