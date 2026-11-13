# Arya 2.0.0 installer and editor qualification

The actual macOS SDK installer and both VSIX variants passed their local gates
using the compiler from successful [macOS qualification job 132039162194](https://github.com/HamzaArya/arya-lang/actions/runs/43470021848/job/132039162194).
The exact identities and results are in [distribution.json](distribution.json).
These records describe verified files; release publication remains a separate step.

## SDK installation

The qualifying compiler is ARM64 with Mach-O minimum macOS 15.0, built using SDK
15.5. Its SHA-256 is
`fdd021f30cdbb09165898beb01ce189d76af4d4714ad119640748695ba2e07d1`.
The installer was exercised on macOS 26.5.2 under an isolated prefix containing
spaces. It verified the SDK, created a versioned directory and managed launcher,
and retained the compiler's exact hash.

The exact compiler also passed `codesign --verify --strict`; its signature is
ad-hoc and linker-signed, with no Team Identifier. This is a binary-integrity
check, not Developer ID identity or Apple notarization. Local execution evidence
does not establish approval of a browser-quarantined download.

The installed launcher then created a CLI project, checked annotated source,
built a native executable and ran it successfully. Both project and output paths
contained spaces. No library-directory or C-compiler override was configured.
Exact decimal addition printed `0.3`; the new decimal remainder operation printed
`2`. The executable ran with `PATH=/nonexistent`, without an Arya installation
on its execution PATH. Build time was 19.47 seconds on this host.

## Linux SDK qualification

[Linux job 132073915697](https://github.com/HamzaArya/arya-lang/actions/runs/43480059478/job/132073915697)
passed on Ubuntu 24.04 x64 from source
`25f1915af4886f3b61c35aa753cd1defe78c1f3a`. Its gates include the full native
bootstrap/core suite, typed APIs, HTTP relocation, actual GTK actions under
Xvfb, distribution packaging and the real installer. The installed command
created, checked and built a CLI project through a prefix containing spaces,
then the compiled program ran with the expected output.

The downloaded [Linux SDK inspection](linux-sdk.json) records the exact compiler,
archive, installer and checksum inventory identities. All 563 SDK files and all
260 selected native build inputs were verified locally without executing the
Linux binary on macOS. The installer bytes match the current checkout. This
qualifies the Ubuntu 24.04 x64 runner environment; an ELF ABI note alone does not
establish compatibility with older distributions. GUI programs require GTK 3
and a graphical display. Final metadata assembly and publication remain separate.

## Editor packages

Both packages were actually installed into isolated VS Code profiles. Each
passed ten checks: default compiler selection, hover, completion, definition,
references, rename, formatting, semantic tokens, symbols and live type diagnostics.

- The bundled macOS ARM64 package selected its embedded compiler automatically.
- The portable package contained no compiler and selected the installed `arya`
  command from PATH. This gate used the command-line launch environment established
  by VS Code's own launcher. No `arya.compilerPath` override was configured.

Both packages identify version 2.0.0 with stable preview flags and contain the
same editor adapter bytes as the checkout. The bundled compiler exactly matches
the qualified SDK. Package SHA-256 hashes, measured byte sizes, installed editor
version and individual gate results are recorded in the JSON evidence.

The exact host-tested VSIX bytes were retained for final publication instead of
repacking them with new ZIP timestamps. [Final payload comparison](vsix-payload-verification.json)
matched all 37 editor source files in each package and all 169 compiler/library
files in the bundled package, plus its notices and platform/version metadata.
SDK installer and documentation files are not embedded in these VSIX packages.

## Refreshing final SDK metadata

The release can refresh installer, qualification and documentation files around
an existing qualified SDK without rebuilding its runtime. The retained
[assembly controller](reassemble-qualified-sdk.py) uses explicit
[qualified SDK pins](sdk-assembly-inputs.json), verifies the original complete
checksum inventory and every selected native build input, then copies into a
new destination. It rejects changes to compiler, libraries, standard libraries,
examples, original `BUILD-INFO.txt` or original `SOURCE-SHA256SUMS`.

From the frozen full repository checkout:

```sh
python3 docs/verification/2.0.0/reassemble-qualified-sdk.py \
  --platform darwin-arm64 \
  --sdk /path/to/qualified/arya-native-2.0.0-darwin-arm64 \
  --destination /new/stage/arya-native-2.0.0-darwin-arm64
```

Linux uses `--platform linux-x64` with its separately qualified input profile.
The controller does not execute a foreign binary. Packaging inputs must have
identical inventories and hashes before and after the copy. Separate
`ASSEMBLY-INFO.json` and `ASSEMBLY-SOURCE-SHA256SUMS` record the later packaging
source, while the original compiler-build evidence remains unchanged. The new
SDK checksum inventory covers every final file. A native installer smoke and
archive verification are still required separately; assembly alone does not
claim those results. Windows uses `--platform windows-cygwin-x64` after its native
CI packaging and installer gates pass. That profile additionally pins the exact
native-tested installer; assembly rejects any installer change and preserves
`arya.exe`, the Windows dependency record and platform README byte-for-byte.

## Problems found and resolved

The first portable host attempt exceeded macOS's Unix-domain socket path limit
because the generated test-profile path was too long. VS Code stopped before
extension activation. The harness now uses a compact directory prefix.

The second attempt directly launched the macOS app, which loaded the user's
login-shell PATH instead of the isolated test prefix. The harness now sets
`VSCODE_CLI=1`, matching the installed `code` launcher's behavior. The full portable
gate then passed. Neither fix changed the editor adapter or native compiler.
Both failed attempts and the passing retry remain recorded; raw output paths are
listed in the JSON evidence. The controller also retains partial output when an
editor process times out.

These checks do not establish Windows/Linux editor-host coverage, Developer ID
signing or notarization. The corresponding native platform and application
qualification records state their separate tested scope.
