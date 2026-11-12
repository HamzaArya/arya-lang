#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/data-paths.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in optimized reference sanitized; do
  set -- --release
  if test "$mode" = reference; then set -- --release --no-data-opt; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/data-paths.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.build.log" 2>&1 || { cat "$tmp/$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" > "$tmp/$mode.out"
  if test "$mode" != optimized; then diff -u "$tmp/optimized.out" "$tmp/$mode.out"; fi
  printf '%s\n' "data paths: $mode with GC stress passed"
done
grep -q 'aget_cached' "$tmp/optimized.c"
grep -q 'aimmediate_call' "$tmp/optimized.c"
grep -q 'static AV amod.*aliterals' "$tmp/optimized.c"
