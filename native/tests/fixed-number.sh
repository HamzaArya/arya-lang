#!/bin/sh
# Exact guarded format/parse fusion, observable ordering and managed ownership.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
library=${ARYA_NATIVE_LIBDIR:-$(CDPATH= cd -- "$(dirname -- "$compiler")/lib" && pwd)}
work=$(mktemp -d "$root/.build/fixed-number-test.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
for mode in release sanitized; do
  for variant in optimized reference; do
    set -- --release --runtime-counters
    if test "$mode" = sanitized; then set -- --debug --sanitize --runtime-counters; fi
    if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
    binary="$work/$mode-$variant"
    "$compiler" build "$root/native/tests/fixtures/fixed-number.arya" -o "$binary" "$@" > "$binary.build.log" 2>&1 || { cat "$binary.build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$binary" > "$binary.out" 2> "$binary.err" || { cat "$binary.err" >&2; exit 1; }
  done
  diff -u "$work/$mode-reference.out" "$work/$mode-optimized.out"
  cat "$work/$mode-optimized.out"
  set -- -O3
  if test "$mode" = sanitized; then set -- -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer; fi
  "${ARYA_CC:-${CC:-cc}}" -std=c11 "$@" -ffp-contract=off -Wno-deprecated-declarations -I "$library" "-DARYA_FIXED_NUMBER_SOURCE=\"$work/$mode-optimized.c\"" "$root/native/tests/fixed-number-probe.c" -o "$work/probe-$mode" "$library/libmpdec.a" -lm -pthread > "$work/probe-$mode.build.log" 2>&1 || { cat "$work/probe-$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/probe-$mode"
done
grep -q '=afixed_number_prepare(' "$work/release-optimized.c"
if grep -q '=afixed_number_prepare(' "$work/release-reference.c"; then exit 1; fi
for variant in optimized reference; do
  set -- --release
  if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
  "$compiler" build "$root/native/tests/fixtures/fixed-number-error.arya" -o "$work/error-$variant" "$@" > "$work/error-$variant.build.log" 2>&1
  if env -i PATH=/nonexistent "$work/error-$variant" > "$work/error-$variant.out" 2> "$work/error-$variant.err"; then exit 1; fi
done
diff -u "$work/error-reference.err" "$work/error-optimized.err"
grep -q 'fixed-number-error.arya:3:' "$work/error-optimized.err"
for variant in fused ordinary; do
  env -i PATH=/nonexistent "$work/release-optimized" --counts "$variant" > "$work/count-$variant.out" 2> "$work/count-$variant.err"
done
diff -u "$work/count-fused.out" "$work/count-ordinary.out"
fused=$(sed -n 's/.*"callocCalls":\([0-9][0-9]*\).*/\1/p' "$work/count-fused.err")
ordinary=$(sed -n 's/.*"callocCalls":\([0-9][0-9]*\).*/\1/p' "$work/count-ordinary.err")
test "$((ordinary - fused))" -eq 30000
printf '%s\n' 'fixed number: reference/ASan/UBSan/GC, source locations, depth, and 30000 avoided temporary allocations passed'
