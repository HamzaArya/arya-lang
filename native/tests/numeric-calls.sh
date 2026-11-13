#!/bin/sh
# Immediate numeric calls preserve generic semantics and bound-method ownership.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/numeric-calls.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release sanitized; do
  for variant in optimized reference; do
    set -- --release --runtime-counters
    if test "$mode" = sanitized; then set -- --debug --sanitize --runtime-counters; fi
    if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
    binary="$tmp/$mode-$variant"
    "$compiler" build "$root/native/tests/fixtures/numeric-calls.arya" -o "$binary" "$@" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$binary" > "$binary.out" 2> "$binary.err" || { cat "$binary.err" >&2; exit 1; }
  done
  diff -u "$tmp/$mode-reference.out" "$tmp/$mode-optimized.out"
  cat "$tmp/$mode-optimized.out"
done
for variant in optimized reference; do
  env -i PATH=/nonexistent "$tmp/release-$variant" --counts > "$tmp/count-$variant.out" 2> "$tmp/count-$variant.err"
done
diff -u "$tmp/count-reference.out" "$tmp/count-optimized.out"
opt_functions=$(sed -n 's/.*"functions":\([0-9][0-9]*\).*/\1/p' "$tmp/count-optimized.err")
ref_functions=$(sed -n 's/.*"functions":\([0-9][0-9]*\).*/\1/p' "$tmp/count-reference.err")
opt_allocations=$(sed -n 's/.*"callocCalls":\([0-9][0-9]*\).*/\1/p' "$tmp/count-optimized.err")
ref_allocations=$(sed -n 's/.*"callocCalls":\([0-9][0-9]*\).*/\1/p' "$tmp/count-reference.err")
test "$((ref_functions - opt_functions))" -eq 30000
# --no-data-opt also disables literal interning, so its total allocation delta
# includes repeated method/property key strings. The isolated before/after
# benchmark holds those optimizations fixed and measures exactly 90000 fewer.
test "$((ref_allocations - opt_allocations))" -ge 90000
printf '%s\n' "numeric dispatch: 30000 immediate calls avoid 30000 bound functions and at least 90000 calloc calls; reference/sanitizer/GC checks passed"
