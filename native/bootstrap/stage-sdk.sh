#!/bin/sh
# Assemble the installed layout without publishing a release archive.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
test "$#" -eq 1 || { printf '%s\n' 'usage: stage-sdk.sh empty-destination' >&2; exit 2; }
destination=$1
test ! -e "$destination" && test ! -L "$destination" || { printf '%s\n' "SDK destination exists: $destination" >&2; exit 1; }
test -f "$root/.build/independent/arya.c" && test -f "$root/.build/independent/stage2.c" || { printf '%s\n' 'SDK staging requires the native generated C build evidence.' >&2; exit 1; }
expected_crypto=$(awk 'NR == 1 {print $1}' "$root/native/vendor/openssl/openssl-3.5.9.tar.gz.sha256")
if test -z "$expected_crypto" || test ! -f "$root/.build/independent/lib/openssl-source.sha256" || test "$(cat "$root/.build/independent/lib/openssl-source.sha256")" != "$expected_crypto"; then
  printf '%s\n' 'SDK crypto source identity differs from the pinned archive; rebuild make native-crypto.' >&2
  exit 1
fi
executable=arya
case $(uname -s) in CYGWIN*) executable=arya.exe;; esac
mkdir -p "$destination/docs"
cp "$root/.build/independent/$executable" "$destination/$executable"
if test "$executable" = arya.exe; then
  cygcheck "$destination/$executable" > "$destination/WINDOWS-DEPENDENCIES.txt"
fi
cp -R "$root/.build/independent/lib" "$root/.build/independent/stdlib" "$destination/"
# Editor transports execute in their host's JavaScript environment. Keep them
# outside the standalone SDK, even if native-editor was built in this checkout.
cp "$root/LICENSE" "$root/NOTICE" "$root/native/THIRD-PARTY-NOTICES.txt" "$root/native/manifest.json" "$root/native/PROVENANCE.json" "$destination/"
cp "$root/native/VERSION" "$destination/VERSION"
cp "$root/native/bootstrap/install-sdk.sh" "$destination/install.sh"
if test -d "$root/native/qualification"; then
  cp -R "$root/native/qualification" "$destination/qualification"
  cat > "$destination/qualification/README.txt" <<'TEXT'
Qualification records

Each record describes its own measured snapshot. Older records and source
manifests are retained unchanged; they can describe an earlier implementation
with the same version string. Compare recorded compiler/source identities
with this SDK before applying any qualification or performance result.

See ../BUILD-INFO.txt and ../SOURCE-SHA256SUMS for this assembly's identities,
and ../docs/native-syntax.md for the current verification report.
The earlier engineering audit is in ../docs/native-professionalization.md.
TEXT
fi
sh "$root/native/bootstrap/copy-documentation.sh" sdk "$root" "$destination"
# These identities describe the source tree being assembled, independently of
# historical qualification records. No interpreter or Git checkout is needed.
(cd "$root" && {
  printf '%s\n' Makefile LICENSE NOTICE native/VERSION native/manifest.json native/PROVENANCE.json native/THIRD-PARTY-NOTICES.txt native/DOCUMENTATION
  find native/compiler native/runtime native/libraries native/bootstrap native/tests native/vendor native/python native/desktop native/gui bin \
    -type f ! -name '*.pyc' ! -path '*/__pycache__/*' -print
} | LC_ALL=C sort | while IFS= read -r filename; do shasum -a 256 "$filename"; done) > "$destination/SOURCE-SHA256SUMS"
{
  printf '%s\n' 'Native Arya SDK assembly identities'
  printf 'assembledAtUtc: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'host: %s\n' "$(uname -srm)"
  printf 'version: %s\n' "$(cat "$root/native/VERSION")"
  printf 'compilerSha256: %s\n' "$(shasum -a 256 "$destination/$executable" | awk '{print $1}')"
  printf 'generatedCSha256: %s\n' "$(shasum -a 256 "$root/.build/independent/arya.c" | awk '{print $1}')"
  printf 'stageTwoCSha256: %s\n' "$(shasum -a 256 "$root/.build/independent/stage2.c" | awk '{print $1}')"
  if cmp -s "$root/.build/independent/stage2.c" "$root/.build/independent/arya.c"; then
    printf '%s\n' 'stageTwoThreeCIdentical: true'
  else
    printf '%s\n' 'stageTwoThreeCIdentical: false'
  fi
  printf '\n%s\n' 'SOURCE-SHA256SUMS describes current source inputs at assembly time.' \
    'These source hashes alone do not prove that they produced this binary.' \
    'The separate fresh-source verification gate supplies that build evidence.' \
    'SHA256SUMS covers the actual SDK files, including these identity records.'
} > "$destination/BUILD-INFO.txt"
cat > "$destination/README.txt" <<'TEXT'
Arya native SDK

Run ./arya --version, then ./arya create my-app --template cli.
Run ./arya build decimal.arya -o ./example and execute ./example directly.
Keep lib/ and stdlib/ beside arya. A C11 toolchain builds applications.
Node/npm are not required. Python is used only by explicit Python bridges;
MySQL applications need a separately installed native MySQL C client SDK.
The optional desktop module uses AppKit/WebKit. The gui module uses direct OS widgets.
Native editor protocol: ./arya lsp --stdio
The optional VS Code adapter is a separately built VSIX, outside this SDK.
Read docs/README.md and manifest.json for the native profile and limits.
TEXT
if test "$executable" = arya.exe; then
  cat >> "$destination/README.txt" <<'WINDOWS'

Windows/Cygwin package

The compiler is arya.exe, a native Windows PE executable. Use a matching
installed Cygwin environment with gcc-core/gcc-g++ for compilation. Keep its
runtime DLLs (including cygwin1.dll) reachable through the native Windows PATH;
this archive does not redistribute those DLLs. WINDOWS-DEPENDENCIES.txt records
the build host dependency inspection; run cygcheck arya.exe on your machine.

From a Cygwin shell: sh install.sh "$PWD" --prefix "$HOME/.local"
For native Windows editors configure the real installed arya.exe path printed
by the installer, not the Cygwin-only command symlink. This package is not an
MSVC or standalone MinGW SDK. Platform qualification remains in the manifest.
WINDOWS
fi
(cd "$destination" && find . -type f ! -path './SHA256SUMS' -print | LC_ALL=C sort | while IFS= read -r filename; do shasum -a 256 "$filename"; done > SHA256SUMS)
