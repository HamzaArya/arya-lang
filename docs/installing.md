# Install Arya on another computer

Arya provides a native SDK and source builds. The SDK contains the compiler and tools for developing programs; a compiled application can run without installing Arya. Choose the workflow that matches what you want to move.

| Your goal | Transfer | Requirements on the destination |
| --- | --- | --- |
| Write, check and build Arya programs | A matching SDK archive, its checksum and your project sources | Compatible OS/CPU; a C11 toolchain to build programs |
| Run an already compiled application | Its executable, notices, assets/configuration and selected external dependencies | Compatible OS/CPU and system libraries; no Arya compiler or Node |
| Build the latest compiler or try another target | The matching complete source snapshot, including `native/vendor` | POSIX tools, C11, C++20 and Perl; platform qualification still applies |

Development snapshots can share a version string. Select an archive by its accompanying delivery/qualification record and checksum, then inspect `BUILD-INFO.txt`; the version string alone does not identify which syntax or optimizations it contains. Older archives are immutable and do not acquire later changes. A Git clone contains committed work only; use the matching source snapshot for unpublished changes.

## Platform status

| Destination | Current status | Installation route |
| --- | --- | --- |
| macOS, Apple Silicon (`arm64`) | Locally qualified native target | Matching `darwin-arm64` SDK, or source build |
| macOS, Intel (`x86_64`) | Not qualified by the current records | Experimental source build on that Mac; an ARM64 archive is unsuitable |
| Linux, x64 or ARM64 | Source/CI paths exist; no current local platform qualification is claimed | Experimental native source build and full checks on the target machine |
| Windows with WSL | WSL itself is available; Arya under WSL remains an unqualified Linux target | Set up WSL, then follow the Linux source workflow inside it |
| Native Windows / MSVC | No qualified native SDK or supported MSVC build | Use an appropriate Linux environment for experimentation |

The tested target is recorded in the package's `manifest.json` and qualification evidence. A successful script or an archive filename does not establish support for every OS version. Cross-compilation, universal binaries and WebAssembly are not supplied by these installation steps. Rebuild and test on the OS/CPU you intend to use.

## Install a packaged SDK on an Apple Silicon Mac

This delivery was tested on macOS **26.5.2**. Its compiler binary declares a minimum macOS version of **26.0**; it cannot be installed as a working binary on earlier macOS releases. The minimum load version is not a claim that every 26.x release has been tested. On an older Mac, use a package qualified for that OS or build and test the source locally as an experimental target.

Copy the chosen `arya-native-2.0.0-alpha.3-darwin-arm64.tar.gz` and its `.sha256` file to the other Mac. Keep its delivery record if supplied. Install Apple's Command Line Tools if you need to build programs:

```sh
xcode-select --install
cc --version
```

Follow Apple's installation dialog, then run the version check. [Apple's Command Line Tools instructions](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools).

From the directory containing both archive files, verify and extract into a new snapshot directory. Choose a different unused name on each upgrade; `mkdir` deliberately fails if that snapshot already exists.

```sh
shasum -a 256 -c arya-native-2.0.0-alpha.3-darwin-arm64.tar.gz.sha256
mkdir -p "$HOME/.local/opt/arya"
arya_install="$HOME/.local/opt/arya/snapshot-1"
mkdir "$arya_install"
tar -xzf arya-native-2.0.0-alpha.3-darwin-arm64.tar.gz -C "$arya_install"
arya_sdk="$arya_install/arya-native-2.0.0-alpha.3-darwin-arm64"
cd "$arya_sdk"
shasum -a 256 -c SHA256SUMS
./arya --version
export PATH="$arya_sdk:$PATH"
```

The archive checksum checks the transferred archive; `SHA256SUMS` checks the extracted files. Obtain the expected checksum through the same trusted source as the release or delivery record. Keep the entire SDK directory, including `lib/`, `stdlib/`, notices and metadata.

To make this PATH choice persistent, add the following line to `~/.zshrc` on a typical macOS zsh setup, using the snapshot directory you actually installed. Bash users can put the equivalent line in their shell startup file.

```sh
export PATH="$HOME/.local/opt/arya/snapshot-1/arya-native-2.0.0-alpha.3-darwin-arm64:$PATH"
```

Open a new terminal and run `command -v arya` and `arya --version`. You can also use the executable's absolute path without changing PATH. Continue with [your first project](getting-started.md).

## Build the current source

Use a complete source checkout or source snapshot matching the intended changes. For the alpha.3 candidate, use `arya-native-2.0.0-alpha.3-source.tar.gz` from the matching `artifacts/native-syntax-2026-11-13/verified/` delivery; verify its supplied checksum before extracting it. This source archive is separate from the binary SDK and is the appropriate starting point for another target. Core compilation needs a POSIX shell, `make`, a C11 compiler and standard Unix utilities. Accounting requires the compiler's `__int128` support. The full SDK additionally builds Ada URL with C++20 and configures the vendored OpenSSL sources with Perl. Packaging and verification use `shasum`, `tar` and standard filesystem tools. Node, npm and Python are not native build requirements.

For the matching source archive, start from the directory holding the archive and its checksum:

```sh
shasum -a 256 -c arya-native-2.0.0-alpha.3-source.tar.gz.sha256
mkdir arya-source-work
tar -xzf arya-native-2.0.0-alpha.3-source.tar.gz -C arya-source-work
cd arya-source-work/arya-native-2.0.0-alpha.3-source
```

Choose an unused work directory. From this extracted source root, or the root of your matching checkout:

```sh
cc --version
c++ --version
perl --version
make native-sdk
./bin/arya --version
export PATH="$PWD/.build/independent:$PATH"
```

The PATH entry is absolute after expansion, so it continues to work after changing into a project directory. `bin/arya` is a source-checkout launcher; `.build/independent` is the built SDK layout. `make native` builds only the compiler/core dependencies; use `make native-sdk` for the complete supported library set.

Before distributing a newly built target, run:

```sh
make check
make native-clean-test
ARYA_PACKAGE_DIRECTORY="$PWD/artifacts/my-verified-build" make native-package
```

Packaging refuses to replace an existing archive. The clean gate builds from copied source with Node/JavaScript engines and Python excluded from its tool search path, then checks the relocated SDK. It does not uninstall interpreters from your computer. Full checks require a C compiler with AddressSanitizer and UndefinedBehaviorSanitizer support. On an unqualified target, failures must be investigated before calling that target supported.

### Linux development setup

On Ubuntu, the following supplies the usual build prerequisites for an experimental source build:

```sh
sudo apt update
sudo apt install build-essential perl
cc --version
c++ --version
perl --version
command -v shasum
```

Ubuntu's `build-essential` package supplies GCC, G++, libc development headers and make. Use a C++20-capable compiler; installing the prerequisites alone does not qualify Arya on Linux. [Ubuntu package details](https://packages.ubuntu.com/noble/build-essential), [Perl package](https://packages.ubuntu.com/noble/perl), [Ubuntu GCC setup](https://ubuntu.com/developers/docs/howto/gcc-setup/).

Then run the source workflow above inside the Linux environment. Keep `CC` and `CXX` consistent with the desired toolchain. For other distributions, obtain equivalent compiler, development-header, make, Perl and checksum packages through that distribution's instructions. The macOS archive cannot run as a Linux executable.

### Windows through WSL

For a Windows development experiment, follow Microsoft's WSL setup. On a compatible Windows installation, run this in an administrator PowerShell window, complete the requested restart/setup, and open the installed Linux distribution:

```powershell
wsl --install
```

Microsoft documents the current Windows prerequisites and distribution options in [Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install). Inside Ubuntu/WSL, use the Linux source workflow above. Build and run the Linux executable inside WSL; this does not produce a native Windows `.exe`. Arya's current POSIX runtime and toolchain have not been qualified here for WSL or native Windows.

## Move a compiled application

Build a release application on its intended target, then copy the executable, its generated `.NOTICE`, assets and required configuration. You normally do not need its generated `.c` file, the Arya compiler or the SDK to execute it. Retain the dependency/license notices when distributing it.

```sh
arya build main.arya -o ./my-app --release
./my-app
```

The OS/CPU, system-library ABI and enabled features must be compatible on the destination. Launch from the working directory the application expects. Web projects can need their `public/` assets. Explicit Python integration needs its interpreter and Python modules; MySQL integration needs the selected client library; desktop programs need macOS AppKit/WebKit. The native HTTP server does not supply a TLS deployment layer. [SDK layout and deployment details](native-sdk.md).

Inspect dependencies of your own built application with `otool -L ./my-app` on macOS or `ldd ./my-app` on Linux. Do not assume a binary built on a newer OS will run on every older release.

## Editors, upgrades and removal

Use `arya lsp --stdio` with an LSP client. The VS Code-compatible adapter is a separate optional package; its editor host uses JavaScript, while Arya analysis remains native. Installation and configuration are described in the [SDK guide](native-sdk.md#editors).

Install upgrades beside the old SDK, switch PATH or your editor's compiler path, check/test projects and rebuild their binaries. Use `--force` only when intentionally replacing an existing build output. Keep each compiler with its own `lib/` and `stdlib/`; mixing SDK versions can produce incorrect builds. Remove the selected SDK directory and its PATH/editor entry to uninstall it. Projects and compiled applications are separate files.

| Symptom | Check or fix |
| --- | --- |
| `arya: command not found` | Check `command -v arya`, PATH and the shell startup file; try the executable's absolute path. |
| `bad CPU type` / `Exec format error` | Verify OS/CPU with `uname -s` and `uname -m`; obtain or build the matching target. |
| `cc` missing / developer-tools error | Install the platform C toolchain and confirm `cc --version`. |
| Missing `libmpdec.a`, headers or a native SDK library | Restore the complete matching SDK; from source, run `make native-sdk`. |
| Newly documented syntax is rejected | Check the actual executable path and build identity. An older snapshot can have the same alpha version string. |
| Output already exists | Choose a new output path or intentionally use `--force`. |
| Unsupported desktop/MySQL/Python feature | Check its explicit platform/runtime requirements in the SDK and library guides. |
| Checksum mismatch | Stop using that copy; obtain the matching archive/checksum again and verify it before extraction. |
