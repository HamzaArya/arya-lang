#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/standard-calls.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for variant in optimized reference; do
  set -- --debug --sanitize --runtime-counters
  if test "$variant" = reference; then set -- "$@" --no-data-opt; fi
  "$compiler" build "$root/native/tests/fixtures/standard-calls.arya" -o "$tmp/$variant" "$@" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$variant" > "$tmp/$variant.out" 2> "$tmp/$variant.err" || { cat "$tmp/$variant.err" >&2; exit 1; }
done
diff -u "$tmp/reference.out" "$tmp/optimized.out"
grep -q '=astandard_call(' "$tmp/optimized.c"
if grep -q '=astandard_call(' "$tmp/reference.c"; then exit 1; fi
optimized=$(sed -n 's/.*"genericCalls":\([0-9][0-9]*\).*/\1/p' "$tmp/optimized.err")
reference=$(sed -n 's/.*"genericCalls":\([0-9][0-9]*\).*/\1/p' "$tmp/reference.err")
test "$((reference - optimized))" -ge 1000
cat "$tmp/optimized.out"
printf '%s\n' "standard calls: generic dispatch $reference -> $optimized with ASan/UBSan and GC stress"
