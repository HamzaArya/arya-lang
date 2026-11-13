#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
. "$root/native/tests/sanitizer-options.sh"
tmp=$(mktemp -d "$root/.build/decimal-remainder.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release reference "$arya_test_second_mode"; do
  set -- --release
  if test "$mode" = reference; then set -- --release --no-data-opt --no-call-opt; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  if test "$mode" = debug; then set -- --debug; fi
  "$compiler" build "$root/native/tests/fixtures/decimal-remainder.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.log" 2>&1 || { cat "$tmp/$mode.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" > "$tmp/$mode.out"
  cat "$tmp/$mode.out"
  if test "$mode" != release; then diff -u "$tmp/release.out" "$tmp/$mode.out"; fi
done
for body in 'decimal.remainder(1, "2")' 'decimal.remainder("1")' 'decimal.values.remainder(decimal.values.parse("1"))'; do
  printf 'use std "decimal" as decimal\nconst typed: boolean = true\n%s\n' "$body" > "$tmp/invalid.arya"
  if "$compiler" check "$tmp/invalid.arya" > "$tmp/check.log" 2>&1; then cat "$tmp/check.log" >&2; exit 1; fi
  grep -q 'Compile error:' "$tmp/check.log"
done
printf '%s\n' "decimal remainder: independent integer vectors, parsed ownership, rejection contracts, release/reference/$arya_test_second_mode passed"
