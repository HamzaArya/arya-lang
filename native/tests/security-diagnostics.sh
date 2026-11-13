#!/bin/sh
# Node/Python-free library regressions, including instrumented native execution.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/security-diagnostics.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
. "$root/native/tests/runtime-path.sh"
arya_test_prepare_runtime_path "$tmp"
. "$root/native/tests/sanitizer-options.sh"
for mode in release "$arya_test_second_mode"; do
  set -- --release
  if test "$mode" = debug; then set -- --debug; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/security-diagnostics.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.build.log" 2>&1 || { cat "$tmp/$mode.build.log" >&2; exit 1; }
  env -i PATH="$arya_test_runtime_path" ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" > "$tmp/$mode.out" 2> "$tmp/$mode.err" || { cat "$tmp/$mode.err" >&2; exit 1; }
  cat "$tmp/$mode.out"
  status=0
  env -i PATH="$arya_test_runtime_path" ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" --uncaught > "$tmp/$mode.stack.out" 2> "$tmp/$mode.stack.err" || status=$?
  test "$status" = 1 || { cat "$tmp/$mode.stack.err" >&2; exit 1; }
  grep -F 'AryaAssertionError: actionable failure' "$tmp/$mode.stack.err" > /dev/null
  grep -E 'at stackLeaf .*security-diagnostics\.arya:[1-9][0-9]*:[1-9][0-9]*' "$tmp/$mode.stack.err" > /dev/null
  grep -E 'at stackCaller .*security-diagnostics\.arya:[1-9][0-9]*:[1-9][0-9]*' "$tmp/$mode.stack.err" > /dev/null
done
diff -u "$tmp/release.out" "$tmp/$arya_test_second_mode.out"
printf 'security and diagnostics: release, %s and GC stress passed without Node/Python\n' "$arya_test_second_mode"
printf '%s\n' 'source stacks: uncaught assertions report function names and Arya line/column in both build modes'

"$compiler" build "$root/native/tests/fixtures/trace-disabled.arya" -o "$tmp/trace" --release --runtime-counters > "$tmp/trace.build.log" 2>&1 || { cat "$tmp/trace.build.log" >&2; exit 1; }
for count in 100 10000; do
  env -i PATH="$arya_test_runtime_path" "$tmp/trace" "$count" > "$tmp/trace-$count.out" 2> "$tmp/trace-$count.err"
done
diff -u "$tmp/trace-100.out" "$tmp/trace-10000.out"
small=$(sed -n 's/.*"callocCalls":\([0-9][0-9]*\).*/\1/p' "$tmp/trace-100.err")
large=$(sed -n 's/.*"callocCalls":\([0-9][0-9]*\).*/\1/p' "$tmp/trace-10000.err")
test -n "$small" && test "$small" = "$large"
printf '%s\n' "disabled trace: 100 and 10000 guards used $small calloc-wrapper calls each"
