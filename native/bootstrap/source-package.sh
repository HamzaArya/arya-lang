#!/bin/sh
# Assemble complete native build inputs without caches or the retired runtime.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(cat "$root/native/VERSION")
case "$version" in ''|*[!0-9A-Za-z.+-]*) printf '%s\n' 'Invalid native version' >&2; exit 1;; esac
name=arya-native-$version-source
destination=${ARYA_PACKAGE_DIRECTORY:-$root/artifacts}
for filename in "$destination/$name.tar.gz" "$destination/$name.tar.gz.sha256"; do
  if test -e "$filename" || test -L "$filename"; then printf 'Refusing to replace %s\n' "$filename" >&2; exit 1; fi
done
mkdir -p "$root/.build" "$destination"
work=$(mktemp -d "$root/.build/native-source-package.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
source=$work/$name
mkdir "$source"
cp "$root/Makefile" "$root/LICENSE" "$root/NOTICE" "$root/THIRD-PARTY-NOTICES.txt" "$source/"
cp -R "$root/native" "$root/bin" "$source/"
# Only prune the owned staging copy; keep every original checkout byte intact.
find "$source" -type d \( -name .build -o -name .arya -o -name __pycache__ -o -name .git \) -prune -exec rm -rf {} +
find "$source" -type f \( -name '*.pyc' -o -name .DS_Store -o -name '._*' \) -exec rm -f {} +
if test -n "$(find "$source" -type l -print)"; then printf '%s\n' 'Source package inputs must not contain symlinks.' >&2; exit 1; fi
sh "$root/native/bootstrap/copy-documentation.sh" source-package "$root" "$source"
cat > "$source/README.txt" <<'TEXT'
Arya native source distribution

Build: make native-sdk
Check (macOS/Linux): make check && make native-clean-test
Check (Windows/Cygwin): use the platform-specific validation in docs/installing.md
Run:   ./bin/arya --version

Read docs/installing.md for prerequisites, other-computer workflows and the
qualified-platform matrix. Native compilation requires no Node/npm/Python.
Optional reference/benchmark controllers can require Python or Node; they do
not participate in the native source bootstrap or required native test gate.

This contains native build inputs, pinned vendor sources, tests, examples and
the current manual. It excludes generated caches, Git history, compat/node
and the optional editor-host adapter. Building that adapter requires the full
repository checkout; use the native LSP directly from this distribution.

Verify: shasum -a 256 -c SHA256SUMS
Source checksums identify this snapshot; qualification records state exactly
which sources and platforms were tested. A source archive does not establish
that an untested target is supported.
TEXT
(cd "$source" && find . -type f ! -path './SHA256SUMS' -print | LC_ALL=C sort | while IFS= read -r filename; do shasum -a 256 -b "$filename"; done > SHA256SUMS)
COPYFILE_DISABLE=1 tar -czf "$work/$name.tar.gz" -C "$work" "$name"
digest=$(shasum -a 256 -b "$work/$name.tar.gz" | awk '{print $1}')
printf '%s *%s.tar.gz\n' "$digest" "$name" > "$work/checksum"
ln "$work/$name.tar.gz" "$destination/$name.tar.gz"
if ! ln "$work/checksum" "$destination/$name.tar.gz.sha256"; then
  if test "$destination/$name.tar.gz" -ef "$work/$name.tar.gz"; then rm "$destination/$name.tar.gz"; fi
  exit 1
fi
printf '%s\n' "$destination/$name.tar.gz"
