#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/bitwise32.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release sanitized; do
  set -- --release
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/bitwise32.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.log" 2>&1 || { cat "$tmp/$mode.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" > "$tmp/$mode.out"
  cat "$tmp/$mode.out"
done
diff -u "$tmp/release.out" "$tmp/sanitized.out"
printf 'use std "math" as math\nconst result: number = math.and32("wrong", 1)\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/check.log" 2>&1; then exit 1; fi
grep -q 'Type mismatch' "$tmp/check.log"
