#!/bin/sh
# UTF conversion and owned-storage acceptance without an external interpreter.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
work=$(mktemp -d "$root/.build/utf8-storage.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
for mode in release sanitized; do
  set -- --release
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/utf8-storage.arya" -o "$work/$mode" "$@" > "$work/$mode.build.log" 2>&1 || { cat "$work/$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/$mode"
done
sdk=$(CDPATH= cd -- "$(dirname -- "$compiler")" && pwd)
lib=${ARYA_NATIVE_LIBDIR:-$sdk/lib}
for mode in release sanitized; do
  set -- -O2
  if test "$mode" = sanitized; then set -- -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer; fi
  "${ARYA_CC:-${CC:-cc}}" -std=c11 -ffp-contract=off "$@" -DARYA_RUNTIME_COUNTERS=1 -DARYA_UTF8_FAST=1 \
    "-DARYA_UTF8_SOURCE=\"$work/release.c\"" -I "$lib" "$root/native/tests/utf8-storage-guards.c" \
    "$lib/libmpdec.a" -lm -pthread -o "$work/guards-$mode" > "$work/guards-$mode.build.log" 2>&1 || { cat "$work/guards-$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/guards-$mode"
done
