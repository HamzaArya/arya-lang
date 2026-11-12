#!/bin/sh
# Data lifetime/field/method/codec behavior in optimized and comparison modes.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/native-data.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release debug sanitized; do
  for variant in optimized reference; do
    set -- "--$mode"
    if test "$mode" = sanitized; then set -- --debug --sanitize; fi
    if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
    name=$mode-$variant
    "$compiler" build "$root/native/tests/fixtures/data-optimization.arya" -o "$tmp/$name" "$@" > "$tmp/$name.build.log" 2>&1 || { cat "$tmp/$name.build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" > "$tmp/$name.out"
    test "$(cat "$tmp/$name.out")" = 'native data checks: 36'
  done
  diff -u "$tmp/$mode-reference.out" "$tmp/$mode-optimized.out"
  printf '%s\n' "data: $mode field/accessor/method ordering, JSON, closure and async cleanup lifetimes passed"
done
