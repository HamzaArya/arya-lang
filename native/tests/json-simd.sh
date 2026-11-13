#!/bin/sh
# Exact UTF-16 scan positions, bounded loads, and parser semantics without JS.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
work=$(mktemp -d "$root/.build/json-simd-test.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
printf '%s\n' '#!/bin/sh' 'exec "${ARYA_JSON_CC:-cc}" -DARYA_JSON_SCALAR "$@"' > "$work/scalar-cc"
chmod +x "$work/scalar-cc"
for mode in release sanitized; do
  for variant in native scalar; do
    set -- -std=c11 -O2
    if test "$mode" = sanitized; then set -- -std=c11 -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer; fi
    if test "$variant" = scalar; then set -- "$@" -DARYA_JSON_SCALAR; fi
    "${CC:-cc}" "$@" "$root/native/tests/json-simd-scan.c" -o "$work/scan-$mode-$variant"
    env -i PATH=/nonexistent ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/scan-$mode-$variant"
    set -- --release
    if test "$mode" = sanitized; then set -- --debug --sanitize; fi
    if test "$variant" = scalar; then set -- "$@" --cc "$work/scalar-cc"; fi
    binary="$work/$mode-$variant"
    ARYA_JSON_CC="${CC:-cc}" "$compiler" build "$root/native/tests/fixtures/json-simd.arya" -o "$binary" "$@" > "$work/build.log" 2>&1 || { cat "$work/build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$binary" > "$binary.out" 2> "$binary.err" || { cat "$binary.err" >&2; exit 1; }
  done
  diff -u "$work/$mode-native.out" "$work/$mode-scalar.out"
  cat "$work/$mode-native.out"
done
printf '%s\n' 'JSON SIMD: native/scalar, ASan/UBSan, GC stress, guard pages and parser semantics passed'
