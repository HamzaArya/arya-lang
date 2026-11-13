#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/fixed-format.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for fixture in fixed-format data-descriptor; do
  for mode in release sanitized; do
    for variant in optimized reference; do
      set -- --release
      if test "$mode" = sanitized; then set -- --debug --sanitize; fi
      if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
      binary=$tmp/$fixture-$mode-$variant
      "$compiler" build "$root/native/tests/fixtures/$fixture.arya" -o "$binary" "$@" > "$binary.build.log" 2>&1 || { cat "$binary.build.log" >&2; exit 1; }
      env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$binary" > "$binary.out" || exit 1
    done
    diff -u "$tmp/$fixture-$mode-reference.out" "$tmp/$fixture-$mode-optimized.out"
    cat "$tmp/$fixture-$mode-optimized.out"
  done
done
grep -q '=adefine_data_call(' "$tmp/data-descriptor-release-optimized.c"
if grep -q '=adefine_data_call(' "$tmp/data-descriptor-release-reference.c"; then exit 1; fi
