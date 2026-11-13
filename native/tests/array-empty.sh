#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/array-empty.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
. "$root/native/tests/runtime-path.sh"
arya_test_prepare_runtime_path "$tmp"
. "$root/native/tests/sanitizer-options.sh"
for mode in release "$arya_test_second_mode"; do
  set -- --release
  if test "$mode" = debug; then set -- --debug; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/array-empty.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.log" 2>&1 || { cat "$tmp/$mode.log" >&2; exit 1; }
  env -i PATH="$arya_test_runtime_path" ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" > "$tmp/$mode.out"
  cat "$tmp/$mode.out"
done
diff -u "$tmp/release.out" "$tmp/$arya_test_second_mode.out"
