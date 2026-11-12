# Arya native editor

This extension connects to `arya lsp --stdio` for checking, completion, hover,
definitions, references, safe rename, formatting, signatures, semantic colors,
and quick fixes. Set `arya.compilerPath` to your installed native Arya executable
to override the SDK included in the packaged extension. Run and Check use the native executable directly.

Build the compiler with `make native`. Build the extension with
`make native-editor`; install its VSIX with `arya editor install --editor code`
or your editor's Install from VSIX command. `arya editor status` lists detected
editor launchers and `arya editor path` prints the bundled extension location.

Language analysis never executes project imports. Running a file requires
workspace trust. Untrusted workspaces use your global compiler setting.
VS Code supplies the extension host and transport modules; all Arya language
services and application execution use the separate native toolchain.

Python is needed only for explicit Python interoperability. The Python
interpreter setting applies to application tasks, rather than the compiler or
language server.
