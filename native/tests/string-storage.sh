#!/bin/sh
# Shared string ownership and reclamation; no external language runtime required.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
work=$(mktemp -d "$root/.build/string-storage-test.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
for mode in release reference sanitized; do
  set -- --release
  count=512
  if test "$mode" = reference; then set -- --release --no-call-opt --no-data-opt; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; count=64; fi
  "$compiler" build "$root/native/tests/fixtures/string-storage.arya" -o "$work/$mode" "$@" > "$work/$mode.build.log" 2>&1 || { cat "$work/$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/$mode" "$count"
done
sdk=$(CDPATH= cd -- "$(dirname -- "$compiler")" && pwd)
lib=${ARYA_NATIVE_LIBDIR:-$sdk/lib}
"${CC:-cc}" -std=c11 -O0 -g -ffp-contract=off -fsanitize=address,undefined -fno-omit-frame-pointer \
  -DARYA_RUNTIME_COUNTERS=1 "-DARYA_STRING_STORAGE_SOURCE=\"$work/release.c\"" \
  -I "$lib" "$root/native/tests/string-storage-accounting.c" "$lib/libmpdec.a" -lm -pthread -o "$work/accounting" \
  > "$work/accounting.build.log" 2>&1 || { cat "$work/accounting.build.log" >&2; exit 1; }
env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/accounting"
printf '%s\n' 'string storage: optimized/reference, sanitized collector stress, aliases, Unicode and async lifetimes passed'
