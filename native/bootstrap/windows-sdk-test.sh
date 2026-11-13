#!/bin/sh
# Qualify the actual archive, relocation, Cygwin installation and PE GUI binary.
# Run only after the native core and Win32 GUI gates have passed on Windows.
set -eu
case $(uname -s) in CYGWIN*) ;; *) printf '%s\n' 'This gate requires an actual Windows Cygwin host.' >&2; exit 1;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
mkdir -p .build/release-evidence
archive=$(sh native/bootstrap/package.sh)
printf '%s\n' "$archive" > .build/release-evidence/windows-archive.txt
(cd "$(dirname -- "$archive")" && shasum -a 256 -c "$(basename -- "$archive").sha256")
temporary=$(mktemp -d "$root/.build/windows-relocation.XXXXXX")
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
mkdir "$temporary/SDK directory's place"
tar -xzf "$archive" -C "$temporary/SDK directory's place"
sdk=$(find "$temporary/SDK directory's place" -mindepth 1 -maxdepth 1 -type d -print)
test -f "$sdk/arya.exe" && test -f "$sdk/WINDOWS-DEPENDENCIES.txt"
(cd "$sdk" && shasum -a 256 -c SHA256SUMS) > .build/release-evidence/windows-archive-integrity.log
native_cc=$(command -v gcc)
env -u ARYA_NATIVE_LIBDIR "$sdk/arya.exe" build "$root/native/tests/fixtures/decimal.arya" --cc "$native_cc" -o "$temporary/relocated decimal.exe" --release > .build/release-evidence/windows-relocated-build.log 2>&1 || { cat .build/release-evidence/windows-relocated-build.log >&2; exit 1; }
"$temporary/relocated decimal.exe" > "$temporary/decimal.actual"
diff -u native/tests/fixtures/decimal.expected "$temporary/decimal.actual"
env -u ARYA_NATIVE_LIBDIR "$sdk/arya.exe" build "$root/native/tests/fixtures/security-bytes.arya" --cc "$native_cc" -o "$temporary/relocated crypto.exe" --release > .build/release-evidence/windows-relocated-crypto-build.log 2>&1 || { cat .build/release-evidence/windows-relocated-crypto-build.log >&2; exit 1; }
ARYA_GC_STRESS=1 "$temporary/relocated crypto.exe" > "$temporary/crypto.actual"
diff -u native/tests/fixtures/security-bytes.expected "$temporary/crypto.actual"
env -u ARYA_NATIVE_LIBDIR "$sdk/arya.exe" build "$root/native/tests/fixtures/gui.arya" --cc "$native_cc" -o "$temporary/relocated widgets.exe" --release > .build/release-evidence/windows-relocated-gui-build.log 2>&1 || { cat .build/release-evidence/windows-relocated-gui-build.log >&2; exit 1; }
ARYA_GC_STRESS=1 "$temporary/relocated widgets.exe" > .build/release-evidence/windows-relocated-gui.log
cygcheck "$sdk/arya.exe" "$temporary/relocated widgets.exe" "$temporary/relocated crypto.exe" > .build/release-evidence/windows-relocated-dependencies.txt
sh "$sdk/install.sh" "$sdk" --prefix "$temporary/installed SDK" > .build/release-evidence/windows-install.log 2>&1 || { cat .build/release-evidence/windows-install.log >&2; exit 1; }
"$temporary/installed SDK/bin/arya" --version > .build/release-evidence/windows-installed-version.txt
env -u ARYA_NATIVE_LIBDIR "$temporary/installed SDK/bin/arya" create "$temporary/new native project" --template native-gui > .build/release-evidence/windows-installed-create.log 2>&1 || { cat .build/release-evidence/windows-installed-create.log >&2; exit 1; }
env -u ARYA_NATIVE_LIBDIR "$temporary/installed SDK/bin/arya" build "$temporary/new native project/main.arya" --cc "$native_cc" -o "$temporary/installed native application.exe" --release > .build/release-evidence/windows-installed-project.log 2>&1 || { cat .build/release-evidence/windows-installed-project.log >&2; exit 1; }
printf '%s\n' 'Windows/Cygwin archive checksums, relocated SDK, decimal and binary crypto output, native GUI, installer and generated project PASS.'
