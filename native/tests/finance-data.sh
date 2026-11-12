#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/finance-data.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for fixture in finance-values csv-stream; do
  for mode in release sanitized; do
    set -- --release
    if test "$mode" = sanitized; then set -- --debug --sanitize; fi
    "$compiler" build "$root/native/tests/fixtures/$fixture.arya" -o "$tmp/$fixture-$mode" "$@" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; exit 1; }
    if test "$mode" = sanitized; then
      env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$fixture-$mode" --stress
    else
      env -i PATH=/nonexistent "$tmp/$fixture-$mode"
    fi
  done
done
