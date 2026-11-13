#!/bin/sh
# SDK boundary acceptance, deliberately run after optional editor packaging too.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
work=$(mktemp -d "$root/.build/native-distribution.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
sh "$root/native/bootstrap/stage-sdk.sh" "$work/sdk"
find "$work/sdk" -type f \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' -o -name '*.vsix' \) > "$work/foreign-files"
if test -s "$work/foreign-files"; then cat "$work/foreign-files" >&2; exit 1; fi
(cd "$work/sdk" && shasum -a 256 -c SHA256SUMS) > "$work/integrity.log"
# Every regular file except this root inventory must itself be covered,
# including retained evidence files also named SHA256SUMS.
(cd "$work/sdk" && find . -type f -print | grep -Fvx './SHA256SUMS' | LC_ALL=C sort) > "$work/expected-files"
cut -c 67- "$work/sdk/SHA256SUMS" | LC_ALL=C sort > "$work/manifest-files"
diff -u "$work/expected-files" "$work/manifest-files"
test -s "$work/sdk/BUILD-INFO.txt" && test -s "$work/sdk/SOURCE-SHA256SUMS"
(cd "$root" && shasum -a 256 -c "$work/sdk/SOURCE-SHA256SUMS") > "$work/source-integrity.log"
if test -d "$work/sdk/qualification"; then
  test -s "$work/sdk/qualification/$(cat "$work/sdk/VERSION").json"
  grep -Fq '../docs/native-syntax.md' "$work/sdk/qualification/README.txt"
fi
grep -q '(../examples/journal-report.arya)' "$work/sdk/docs/accounting-engine.md"
test -f "$work/sdk/journal-report.arya"
env -i PATH=/nonexistent "$work/sdk/arya" --version
env -i PATH=/nonexistent "$work/sdk/arya" check "$work/sdk/decimal.arya" --json > "$work/check.json"
test -s "$work/sdk/stdlib/auth.arya"
if test "$(uname -s)" = Darwin; then test -s "$work/sdk/lib/libarya-auth.a"; fi
env ARYA_NATIVE_LIBDIR="$work/sdk/lib" "$work/sdk/arya" build "$work/sdk/examples/auth-local.arya" -o "$work/auth-local" --release > "$work/auth-build.log" 2>&1 || { cat "$work/auth-build.log" >&2; exit 1; }
env -i PATH=/nonexistent "$work/auth-local" > "$work/auth-status.json"
grep -Eq '"supported":(true|false)' "$work/auth-status.json"
if env -i PATH=/nonexistent "$work/sdk/arya" editor install --editor code > "$work/editor.log" 2>&1; then exit 1; fi
grep -q 'standalone SDK excludes editor-host JavaScript' "$work/editor.log"
prefix="$work/installed SDK"
sh "$work/sdk/install.sh" "$work/sdk" --prefix "$prefix" > "$work/install.log" 2>&1 || { cat "$work/install.log" >&2; exit 1; }
installed="$prefix/bin/arya"
env -i PATH=/nonexistent "$installed" --version
project="$work/installed CLI project"
env -u ARYA_NATIVE_LIBDIR -u ARYA_C_COMPILER "$installed" create "$project" --template cli > "$work/create.log" 2>&1 || { cat "$work/create.log" >&2; exit 1; }
env -i PATH=/nonexistent "$installed" check "$project/main.arya" --json > "$work/installed-check.json"
env -u ARYA_NATIVE_LIBDIR -u ARYA_C_COMPILER "$installed" build "$project/main.arya" -o "$work/installed native program" --release > "$work/installed-build.log" 2>&1 || { cat "$work/installed-build.log" >&2; exit 1; }
env -i PATH=/nonexistent "$work/installed native program" 19.95 3 > "$work/installed-output.txt"
printf 'Total: 59.85\n' > "$work/installed-expected.txt"
diff -u "$work/installed-expected.txt" "$work/installed-output.txt"
printf '%s\n' 'installation: real versioned prefix, generated CLI project, check/build/run and paths containing spaces passed'
printf '%s\n' 'distribution: native SDK has no JavaScript/VSIX tooling; checksums and interpreter-free analysis passed'
