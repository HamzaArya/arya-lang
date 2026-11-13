# Arya 2.0.0 editor and SDK verification, generation two

The new macOS SDK and both actual VS Code hosts passed. Final SDK metadata
assembly and public distribution remain pending. The
[earlier distribution proof](../distribution.md) retains its original identities;
it does not describe the new bundled extension.

The [qualified macOS SDK](macos-sdk.json) comes from source
`ce80487668e082ffd263c5239d737de7074e4dc4`, desktop run `43495958933`,
job `132128996700`, artifact `14072747629`. Its compiler is ARM64 with minimum
macOS 15.0, built with SDK 15.5. All 582 SDK checksums and 260 selected native
build inputs matched. Stage-two and stage-three generated C matched, strict
ad-hoc signature verification passed, and the compiler executed locally.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| `arya-language-2.0.0-darwin-arm64.vsix` | 6,837,887 | `abea580d285bc593f08fe19a171de78e8b81be2009557b1316f2f51c9bc94491` |
| `arya-language-2.0.0-portable.vsix` | 668,490 | `3f14e6cab04c0d50bd297906e0229bdc5dcf66ee2787bb78ef9d62548baef783` |

The bundled extension was newly packaged with compiler
`06d9dd9ce6d7447f3ce1ba15945538c9148ff896c7d09932f90fdad6b2c53c94`.
The portable archive retains its exact earlier bytes. All 37 adapter files match
the current source, and all 173 bundled native entries match the new qualified
SDK and packaging inputs. That count is the same 169 compiler/library/stdlib
files plus three notices and one platform descriptor counted separately in the
earlier proof. There are no added or removed native filenames, test files or build
caches. The rebuilt compiler and eight native libraries have new bytes, all
checked against this generation's qualified SDK.

Both packages were installed into separate clean VS Code profiles. The bundled
host selected its embedded compiler automatically. The portable host selected a
newly installed SDK through PATH, with no compiler setting override. Installation
used HOME unset and a prefix containing spaces. Each actual host passed all ten
checks: compiler selection, hover, completion, definition, references, rename,
formatting, semantic tokens, symbols and live type diagnostics. The exact package,
compiler, installation and retained raw profile paths are in
[the distribution record](distribution.json).

The packages and binary-mode checksum sidecars are retained under
`.build/release-2.0.0/generation-2/final/`. The portable extension requires a
separately installed platform SDK; this verification does not claim Linux or
Windows bundled extensions. Compiler signature checks establish consistency,
not a Developer ID signature or notarization.
