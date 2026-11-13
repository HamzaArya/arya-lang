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

## Platform packages and portable package

A platform VSIX includes the native SDK for the operating system and architecture
where it was packaged. The extension checks this identity before starting the
bundled compiler. In a remote VS Code window the extension host's platform is
used, which may differ from the computer displaying the window.

A portable VSIX contains editor assets and transport only. It uses `arya` from
PATH (`arya.exe` on Windows), or the full path in `arya.compilerPath`. Installing
a portable extension does not install a compiler or qualify an operating system.
Check the SDK's release notes for the exact supported target and dependencies.

```sh
# Package a complete, matching native SDK (default: .build/independent).
sh native/bootstrap/editor-package.sh --sdk /path/to/sdk --output /path/to/arya-native.vsix
# Package only the editor transport; no SDK or build tool is needed.
sh native/bootstrap/editor-package.sh --mode portable --output /path/to/arya-portable.vsix
```

The package version comes from `native/VERSION`. Versions containing a prerelease
suffix mark the VSIX as a preview; stable versions do not. Bundled packaging
refuses a compiler whose `--version` differs from that source version.

For a macOS or Linux SDK containing `install.sh`, run `sh ./install.sh .` from
its extracted directory. This verifies its checksum manifest and installs under
`~/.local`; add `~/.local/bin` to PATH. Upgrade installations retain earlier SDK
versions and switch only the managed `arya` launcher. The installer refuses to
overwrite an unrelated executable. Checksums establish file integrity, not the
publisher's identity; obtain archives from the official release page.
