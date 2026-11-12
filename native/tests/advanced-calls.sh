#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/advanced-calls.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
printf 'advanced-call checks: 47\n' > "$tmp/expected"
for mode in release debug sanitized; do
  for variant in advanced previous reference; do
    set -- "--$mode"
    if test "$mode" = sanitized; then set -- --debug --sanitize; fi
    if test "$variant" = previous; then set -- "$@" --no-advanced-call-opt; fi
    if test "$variant" = reference; then set -- "$@" --no-call-opt; fi
    name=$mode-$variant
    "$compiler" build "$root/native/tests/fixtures/advanced-calls.arya" -o "$tmp/$name" "$@" > "$tmp/$name.build.log" 2>&1 || { cat "$tmp/$name.build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" > "$tmp/$name.out"
    diff -u "$tmp/expected" "$tmp/$name.out"
    if test "$mode" != sanitized; then
      env -i PATH=/nonexistent "$tmp/$name" > "$tmp/$name.normal"
      diff -u "$tmp/expected" "$tmp/$name.normal"
    fi
  done
  printf '%s\n' "advanced calls: $mode semantics passed in advanced/previous/reference modes"
done
counter() { sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p" "$1"; }
for kernel in scalar closure; do
  source=$root/native/tests/fixtures/advanced-call-kernel.arya
  if test "$kernel" = closure; then source=$root/native/tests/fixtures/advanced-call-closure-kernel.arya; fi
  for variant in advanced previous; do
    set --
    if test "$variant" = previous; then set -- --no-advanced-call-opt; fi
    name=$kernel-$variant
    "$compiler" build "$source" -o "$tmp/$name" --release --runtime-counters "$@" > "$tmp/$name.build.log" 2>&1 || { cat "$tmp/$name.build.log" >&2; exit 1; }
    for size in 10 100000; do
      env -i PATH=/nonexistent "$tmp/$name" "$size" > "$tmp/$name-$size.out" 2> "$tmp/$name-$size.counters"
    done
  done
  for size in 10 100000; do diff -u "$tmp/$kernel-previous-$size.out" "$tmp/$kernel-advanced-$size.out"; done
done
for metric in rootPushes environmentLookups heapObjects callocCalls; do
  test "$(counter "$tmp/scalar-advanced-10.counters" "$metric")" = "$(counter "$tmp/scalar-advanced-100000.counters" "$metric")"
done
test "$(counter "$tmp/scalar-advanced-100000.counters" scalarCalls)" -gt 200000
test "$(counter "$tmp/scalar-previous-100000.counters" scalarCalls)" -eq 0
for metric in rootPushes environmentLookups; do
  advanced=$(counter "$tmp/closure-advanced-100000.counters" "$metric")
  previous=$(counter "$tmp/closure-previous-100000.counters" "$metric")
  test "$((advanced * 2))" -lt "$previous"
done
test "$(counter "$tmp/closure-advanced-100000.counters" rootedCalls)" -gt 200000
printf '%s\n' 'advanced calls: scalar root/lookup bounds and captured-call reductions passed'
