#!/bin/sh
# Independent call/frame conformance. No Node, Python, or network dependency.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/native-calls.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
printf 'function-call checks: 53\n' > "$tmp/expected"

for mode in release debug; do
  for variant in optimized reference; do
    set --
    if test "$variant" = reference; then set -- --no-call-opt; fi
    name=$mode-$variant
    "$compiler" build "$root/native/tests/fixtures/function-calls.arya" -o "$tmp/$name" "--$mode" "$@" > "$tmp/$name.build.log" 2>&1 || { cat "$tmp/$name.build.log" >&2; exit 1; }
    env -i PATH=/nonexistent "$tmp/$name" > "$tmp/$name.actual"
    diff -u "$tmp/expected" "$tmp/$name.actual"
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 "$tmp/$name" > "$tmp/$name.stress"
    diff -u "$tmp/expected" "$tmp/$name.stress"
  done
  printf '%s\n' "calls: $mode optimized/reference semantics and GC stress passed"
done

for variant in optimized reference; do
  set --
  if test "$variant" = reference; then set -- --no-call-opt; fi
  "$compiler" build "$root/native/tests/fixtures/function-calls.arya" -o "$tmp/sanitized-$variant" --sanitize --debug "$@" > "$tmp/sanitized-$variant.build.log" 2>&1 || { cat "$tmp/sanitized-$variant.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/sanitized-$variant" > "$tmp/sanitized-$variant.actual"
  diff -u "$tmp/expected" "$tmp/sanitized-$variant.actual"
done
printf '%s\n' 'calls: ASan/UBSan optimized/reference with GC stress passed (leak detection not run)'

# Call-depth failure still carries real Arya function names and source locations.
cat > "$tmp/trace.arya" <<'ARYA'
fn descend(n) { if n == 0 { return 0 }; return descend(n - 1) }
async fn failLater() { return descend(520) }
async fn adopt() { return failLater() }
await adopt()
ARYA
for mode in release sanitized; do
  for variant in optimized reference; do
    set -- --release
    if test "$mode" = sanitized; then set -- --sanitize --debug; fi
    if test "$variant" = reference; then set -- "$@" --no-call-opt; fi
    name=trace-$mode-$variant
    "$compiler" build "$tmp/trace.arya" -o "$tmp/$name" "$@" > "$tmp/$name.build.log" 2>&1
    if env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" > "$tmp/$name.out" 2> "$tmp/$name.err"; then
      printf '%s\n' 'Expected call-depth failure' >&2; exit 1
    fi
    grep -q 'Native call depth exceeds 512' "$tmp/$name.err"
    grep -q "at descend ($tmp/trace.arya:1:" "$tmp/$name.err"
  done
done

counter() {
  sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p" "$1"
}
for variant in optimized reference; do
  set --
  if test "$variant" = reference; then set -- --no-call-opt; fi
  "$compiler" build "$root/native/tests/fixtures/function-call-kernel.arya" -o "$tmp/kernel-$variant" --release --runtime-counters "$@" > "$tmp/kernel-$variant.build.log" 2>&1
  for size in 10 24; do
    env -i PATH=/nonexistent "$tmp/kernel-$variant" "$size" > "$tmp/$variant-$size.out" 2> "$tmp/$variant-$size.counters"
  done
done
for size in 10 24; do diff -u "$tmp/reference-$size.out" "$tmp/optimized-$size.out"; done
for metric in callocCalls heapObjects environments heapTemporaries; do
  test "$(counter "$tmp/optimized-10.counters" "$metric")" = "$(counter "$tmp/optimized-24.counters" "$metric")"
done
test "$(counter "$tmp/optimized-24.counters" numericCalls)" -gt 300000
test "$(counter "$tmp/reference-24.counters" numericCalls)" -eq 0
test "$(counter "$tmp/reference-24.counters" directCalls)" -eq 0
optimized=$(counter "$tmp/optimized-24.counters" callocCalls)
reference=$(counter "$tmp/reference-24.counters" callocCalls)
test "$optimized" -lt "$((reference / 20))"
printf '%s\n' "calls: depth traces and allocation bounds passed ($optimized vs $reference calloc calls)"

# Boolean calls cannot use numeric specialization. Verify the general direct
# call path also has bounded temporary/environment allocation as work grows.
for variant in optimized reference; do
  set --
  if test "$variant" = reference; then set -- --no-call-opt; fi
  "$compiler" build "$root/native/tests/fixtures/function-call-generic-kernel.arya" -o "$tmp/general-$variant" --release --runtime-counters "$@" > "$tmp/general-$variant.build.log" 2>&1
  for size in 10 100000; do
    env -i PATH=/nonexistent "$tmp/general-$variant" "$size" > "$tmp/general-$variant-$size.out" 2> "$tmp/general-$variant-$size.counters"
  done
done
for size in 10 100000; do diff -u "$tmp/general-reference-$size.out" "$tmp/general-optimized-$size.out"; done
for metric in callocCalls heapObjects environments heapTemporaries; do
  test "$(counter "$tmp/general-optimized-10.counters" "$metric")" = "$(counter "$tmp/general-optimized-100000.counters" "$metric")"
done
test "$(counter "$tmp/general-optimized-100000.counters" numericCalls)" -eq 0
test "$(counter "$tmp/general-optimized-100000.counters" directCalls)" -gt 200000
optimized=$(counter "$tmp/general-optimized-100000.counters" callocCalls)
reference=$(counter "$tmp/general-reference-100000.counters" callocCalls)
test "$optimized" -lt "$((reference / 20))"
printf '%s\n' "calls: general nonnumeric call allocation bounds passed ($optimized vs $reference calloc calls)"
