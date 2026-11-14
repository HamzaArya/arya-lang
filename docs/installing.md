# Install Arya 2.0.0

Arya's native SDK contains the compiler, standard libraries and application
build tools. A compiled application runs directly without installing Arya or
Node. Choose the archive for the destination OS and architecture from the
[versioned release](https://github.com/HamzaArya/arya-lang/releases/tag/v2.0.0).
Only assets actually published there are available downloads.

| Goal | What to install or transfer |
| --- | --- |
| Write, check and build programs | The matching complete native SDK; a C11 toolchain to build applications |
| Run a compiled application | Its executable, notices, assets/configuration and required native dependencies |
| Build the compiler from source | The complete source archive with `native/vendor`, POSIX build tools, C11, C++20 and Perl |
| Edit in VS Code | A separate platform VSIX with its SDK, or the portable VSIX plus an installed SDK |

## Platform qualification

The 2.0.0 version identifies this release line. It does not establish that every
platform or OS version has passed testing. Check the release's qualification
record, archive checksum and SDK `BUILD-INFO.txt` for the actual binary.

| Target | Implementation and qualification status |
| --- | --- |
| macOS Apple silicon | Qualified native compiler and direct AppKit controls; SDK minimum macOS 15.0, also exercised locally on macOS 26.5.2. The separate application bundles require macOS 26+. |
| macOS Intel | Build on the target Mac; no Intel release qualification is claimed here. |
| Linux x64 | Qualified on Ubuntu 24.04, including actual GTK controls, SDK installation and generated CLI check/build/run. Other libc/GTK distribution versions require their own checks. |
| Linux ARM64 | Requires a native build and target checks; no ARM64 release qualification is claimed here. |
| Windows x64 with Cygwin | Qualified native Windows PE SDK, direct Win32 controls, relocation and Cygwin-shell installation; matching Cygwin runtime DLLs remain required. |
| Windows MSVC or MinGW | No supported build or qualified SDK is supplied by these instructions. |

These workflows build on the target platform. They do not supply cross-compilation,
universal binaries or WebAssembly. The minimum OS version must come from the
published binary and its qualification record; older alpha binaries' minimum
versions do not describe newly built 2.0.0 artifacts.

## Install a macOS or Linux SDK

Download the matching archive and `.sha256` file. On macOS, install Apple's
Command Line Tools if you will build programs:

```sh
xcode-select --install
cc --version
```

Follow [Apple's Command Line Tools instructions](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools).
Linux needs its C toolchain; GTK applications also need the GTK 3 development
files when building and GTK 3 runtime libraries when running.

For a published Apple silicon package, run the following from the download
folder. On Linux, substitute the exact Linux archive name and use
`sha256sum -c` if `shasum` is unavailable.

```sh
shasum -a 256 -c arya-native-2.0.0-darwin-arm64.tar.gz.sha256
mkdir arya-sdk-extract
tar -xzf arya-native-2.0.0-darwin-arm64.tar.gz -C arya-sdk-extract
cd arya-sdk-extract/arya-native-2.0.0-darwin-arm64
sh ./install.sh .
"$HOME/.local/bin/arya" --version
```

Choose an unused extraction directory. The installer verifies every SDK file,
rejects altered or unlisted files and symlinks, and installs a versioned directory
under `~/.local/lib/arya/`. It creates or switches only its managed
`~/.local/bin/arya` symlink and refuses to overwrite an unrelated executable.
Older installed versions remain available for rollback. To use a different
absolute prefix, pass `--prefix /absolute/installation/path`.

Add this line to your shell startup file (`~/.zshrc` for a typical macOS zsh
setup), then open a new terminal:

```sh
export PATH="$HOME/.local/bin:$PATH"
command -v arya
arya --version
```

Keep `lib/`, `stdlib/`, notices and metadata with the actual compiler. Checksums
identify and detect corruption in files; they do not authenticate a publisher.
Obtain both archive and expected checksum from the official release. You can
also keep the extracted SDK in place and use `./arya` directly without installing.
Continue with [your first project](getting-started.md).

The macOS compiler has a verified ad-hoc linker signature, without Developer ID
signing or Apple notarization. A browser-downloaded copy may need macOS's
per-file approval before it runs; the [downloaded binary guidance](#downloaded-macos-applications)
also applies to the compiler. Building from the verified source archive is
another installation route. No system-wide Gatekeeper setting is changed.

## Build from source

Verify the source archive before extraction:

```sh
shasum -a 256 -c arya-native-2.0.0-source.tar.gz.sha256
mkdir arya-source-work
tar -xzf arya-native-2.0.0-source.tar.gz -C arya-source-work
cd arya-source-work/arya-native-2.0.0-source
make native-sdk
./bin/arya --version
export PATH="$PWD/.build/independent:$PATH"
```

A matching repository checkout also works. Core compilation needs a POSIX shell,
`make`, C11 and standard Unix utilities; accounting uses `__int128`. The full SDK
also needs C++20 for Ada URL and Perl for the pinned OpenSSL build. Native
compilation does not need Node, npm or Python. Optional reference-test controllers
can require Python. The source archive excludes the optional editor-host adapter;
use a published VSIX, native LSP, or a full repository checkout to package it.

Before distributing a macOS or Linux build, run the required checks on that target.
Windows/Cygwin uses the separate capability-aware route below.

```sh
make check
make native-clean-test
make native-api-test
make native-gui-test
ARYA_PACKAGE_DIRECTORY="$PWD/artifacts/my-verified-build" make native-package
```

GUI checks need a graphical session. Linux CI can use
`xvfb-run -a sh native/tests/gui.sh`. Sanitizer checks need compiler support for
AddressSanitizer and UndefinedBehaviorSanitizer. Investigate failures before
claiming the target is qualified. Packaging refuses to replace existing archives.

### Linux prerequisites

For Ubuntu, install the compiler tools and GTK 3 build dependencies:

```sh
sudo apt update
sudo apt install build-essential perl libgtk-3-dev pkg-config xvfb
cc --version
c++ --version
pkg-config --modversion gtk+-3.0
```

Then use the source workflow above. Other distributions need equivalent C/C++
compilers, development headers, make, Perl, checksum tools and GTK 3 packages.
Building on a newer distribution does not establish compatibility with every
older libc or GTK version. Linux GUI applications need a graphical display.

### Windows x64 with Cygwin

Use the official [Cygwin installer](https://www.cygwin.com/install.html) and select
`gcc-core`, `gcc-g++`, `make`, `perl`, `libcrypt-devel`, `libiconv-devel`,
`pkg-config`, `zip`, `unzip`, `diffutils`, `patch`, `tar`, `gzip`, `bzip2`, `xz`
and `coreutils`. The base install alone does not contain every build dependency.
The setup program installs and updates these packages.

Install Cygwin `python3` as well to run the release test controllers below.
Python is a test dependency here; the native compiler and native CLI/GUI
applications do not need it.

Open a Cygwin terminal in the source directory, then run:

```sh
make native-sdk CC=gcc CXX=g++
./.build/independent/arya.exe --version
sh native/bootstrap/windows-path-test.sh
sh native/bootstrap/windows-runtime-test.sh
sh native/bootstrap/windows-sdk-test.sh
cygcheck .build/independent/arya.exe
```

These checks exercise the actual Cygwin DLL/toolchain search path, core and
direct Win32 behavior, API contracts, SDK archive relocation and installation.
The controller probes sanitizer support and records release/debug plus GC
stress when Cygwin's GCC lacks ASan/UBSan. It also records unsupported file-size
fault injection separately; these are not claimed as Windows sanitizer or
fault-injection passes. Use this route instead of the Unix `make check` and
`make native-clean-test` targets. The full release workflow additionally checks
the native Windows editor transport using its separate Node test controller.

The compiler and applications are Windows `.exe` files. `std gui` uses Win32
controls; the runtime also depends on Cygwin DLLs, including `cygwin1.dll`.
Use `cygcheck` on each executable to identify its complete dependency set.
An installed matching Cygwin environment supplies those dependencies. Do not
copy an arbitrary DLL version into a release and assume it is compatible.
The SDK installer also has an explicit Cygwin-shell route. After extracting a
`windows-cygwin-x64` archive and verifying its checksum, run from that SDK:

```sh
sh install.sh "$PWD" --prefix "$HOME/.local"
```

It installs the actual `arya.exe` under a versioned `windows-cygwin` directory
and creates a Cygwin command symlink. It prints the real Windows executable
path for native editors. The archive does not bundle Cygwin DLLs; keep the
matching Cygwin `bin` directory on the native Windows PATH. This is not an
MSVC, standalone MinGW, or DLL-free installer. The Windows installation and
relocation gate passed in [run 43495958933](https://github.com/HamzaArya/arya-lang/actions/runs/43495958933).

For native Windows VS Code, set `arya.compilerPath` to the actual Windows path
of `arya.exe`, not a Cygwin-only symlink or `/cygdrive/...` path. In Cygwin,
`cygpath -w "$PWD/.build/independent/arya.exe"` prints that Windows path.
Keep required DLLs reachable by Windows and the Cygwin toolchain available for
building applications. The native Windows editor transport passed its release
gate. Actual bundled and portable VS Code host sessions were qualified on macOS;
that coverage does not imply a full Windows VS Code host run.
[Cygwin path conventions](https://www.cygwin.com/cygwin-ug-net/using.html#using-pathnames).

WSL is a separate Linux route: applications built there are Linux executables.
It does not provide the native Windows target described above.

## Install the VS Code extension

Use **Extensions → Install from VSIX** and select the published 2.0.0 package.
The stable package's preview flag is false. A platform package includes its
matching native SDK; the portable package contains editor transport and assets
only. The editor host runs the transport JavaScript, while Arya analysis and
execution run in the native compiler.

The extension selects a matching bundled SDK by the extension host's operating
system and architecture, then falls back to `arya` on PATH (`arya.exe` on Windows).
Set `arya.compilerPath` to a full executable path to override that choice.
A remote VS Code window uses the remote extension host's platform. Run/Check
require workspace trust; untrusted workspaces ignore project-local compiler
settings. Restart the extension host after changing the compiler selection.

For a portable package on macOS, launch `code .` from a terminal whose PATH
contains the installed SDK. An editor opened from the Dock loads its login-shell
environment; set the SDK path there or configure `arya.compilerPath` with the
installed executable's full path.

From a full repository checkout, package either form without npm:

```sh
make native-editor
sh native/bootstrap/editor-package.sh --mode portable --output /absolute/path/arya-language-2.0.0-portable.vsix
# Or package a separately staged SDK of the matching source version:
sh native/bootstrap/editor-package.sh --sdk /absolute/path/sdk --output /absolute/path/arya-language-2.0.0-platform.vsix
```

The default platform package is `.build/independent/share/editor/arya-language.vsix`.
`./bin/arya editor install --editor code` can install it using a detected editor
launcher. Standalone SDKs exclude the editor-host adapter; use the separate VSIX.
Any compatible LSP client can instead start `arya lsp --stdio` directly.

## Downloaded macOS applications

The two 2.0.0 application collections contain twelve standalone AppKit apps for
Apple Silicon macOS 26 or later. Extract the ZIP, then open an app or copy it to
Applications. Running them does not require the Arya SDK, Node or Python. The
SDK's macOS 15 minimum does not lower these application bundles' macOS 26 minimum.

The apps are ad-hoc signed and their bundle signatures were verified. They have
no Developer ID signature or Apple notarization, so macOS may block a downloaded
app on first launch. Verify the archive against the official release checksum;
see [Apple's guidance for safely opening apps](https://support.apple.com/en-us/102445)
for the operating system's per-app review flow. The release does not install a
system-wide Gatekeeper exception. Ad-hoc signature checks detect bundle changes
but do not authenticate the publisher. [Application qualification](verification/2.0.0/application-release.md)
records exact archive hashes and the tested scope.

## Move applications, upgrade, or remove

Build on the intended target, then copy the executable, generated `.NOTICE`,
assets, configuration and required native dependencies:

```sh
arya build main.arya -o ./my-app --release
./my-app
```

Use an `.exe` output name on Windows. You do not need the Arya SDK or generated
C source to run the resulting application. Direct `std gui` applications use
AppKit on macOS, GTK 3 on Linux, and Win32 plus the Cygwin runtime on the Windows
route. The separate older `std desktop` web-view host remains macOS-specific.
Explicit Python and MySQL integrations still need their external interpreter or
client library. Inspect dependencies with `otool -L`, `ldd`, or `cygcheck` on the
appropriate target. See [SDK deployment details](native-sdk.md).

Install upgrades beside the old version, test projects with the new compiler,
and rebuild applications. Never mix one compiler's `lib/` or `stdlib/` with
another version. To roll back, point PATH or `arya.compilerPath` directly at the
retained old SDK, or deliberately restore the managed launcher's target. To
uninstall, remove only your selected version directory and its managed launcher
or PATH/editor setting; projects and compiled apps remain separate.

| Symptom | Check |
| --- | --- |
| `arya` not found | Inspect PATH and the editor compiler setting; try the actual executable's full path. |
| Wrong CPU / executable format | Obtain a package for the exact OS and architecture. |
| Missing compiler or GTK headers | Install the target build prerequisites. |
| Missing SDK libraries | Restore the complete matching SDK or run `make native-sdk`. |
| Checksum mismatch / unlisted SDK files | Obtain a fresh matching archive and checksum before installing. |
| Installer refuses an existing launcher | Preserve or relocate that unrelated executable; choose another prefix. |
| Installer says version already installed | Use the retained version or a new prefix; the installer does not silently overwrite a version. |
| Windows DLL or path error | Inspect `cygcheck`, the matching Cygwin installation, and the real Windows `arya.exe` path. |
| GUI display cannot initialize | Run in a graphical session; use Xvfb for Linux automated checks. |
