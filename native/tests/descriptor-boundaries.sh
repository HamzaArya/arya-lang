#!/bin/sh
# Compare lowered descriptor calls with ordinary object/call evaluation.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/descriptor-boundaries.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release sanitized; do
  for variant in optimized reference; do
    set -- --release --runtime-counters
    if test "$mode" = sanitized; then set -- --debug --sanitize --runtime-counters; fi
    if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
    binary="$tmp/$mode-$variant"
    "$compiler" build "$root/native/tests/fixtures/descriptor-boundaries.arya" -o "$binary" "$@" > "$binary.build.log" 2>&1 || { cat "$binary.build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$binary" > "$binary.out" 2> "$binary.err" || { cat "$binary.err" >&2; exit 1; }
    calls=$(sed -n 's/.*"dataDescriptorCalls":\([0-9][0-9]*\).*/\1/p' "$binary.err")
    test -n "$calls" || { cat "$binary.err" >&2; exit 1; }
    if test "$variant" = optimized; then test "$calls" -gt 0; else test "$calls" -eq 0; fi
  done
  diff -u "$tmp/$mode-reference.out" "$tmp/$mode-optimized.out"
  cat "$tmp/$mode-optimized.out"
done
printf '%s\n' 'descriptor boundaries: await, collection, callee replacement, generic descriptors and recursion limits passed in release and ASan/UBSan reference comparisons'
