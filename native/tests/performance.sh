#!/bin/sh
# Representation, ordering and ownership regressions for the performance audit.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/native-performance.XXXXXX")
writer=""
child=""
trap 'if test -n "$writer"; then kill "$writer" 2>/dev/null || :; fi; if test -n "$child"; then kill "$child" 2>/dev/null || :; fi; rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release sanitized; do
  set -- --release
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/performance.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.build.log" 2>&1 || { cat "$tmp/$mode.build.log" >&2; exit 1; }
  mkdir "$tmp/$mode-tree" "$tmp/$mode-stress-tree"
  env -i PATH=/nonexistent ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" 4096 "$tmp/$mode-tree" > "$tmp/$mode.out"
  test "$(cat "$tmp/$mode.out")" = 'native performance semantics passed'
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" 64 "$tmp/$mode-stress-tree" > "$tmp/$mode.stress"
  test "$(cat "$tmp/$mode.stress")" = 'native performance semantics passed'
  printf '%s\n' "performance: $mode ordering, aliases, sparse roots and GC stress passed"
  "$compiler" build "$root/native/tests/fixtures/performance-io.arya" -o "$tmp/$mode-io" "$@" > "$tmp/$mode-io.build.log" 2>&1 || { cat "$tmp/$mode-io.build.log" >&2; exit 1; }
  for operation in text json-read json-write; do
    name=$mode-$operation
    mkfifo "$tmp/$name.fifo"
    mkfifo "$tmp/$name-control.fifo"
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode-io" "$tmp/$name.fifo" "$operation" > "$tmp/$name-control.fifo" &
    child=$!
    exec 3< "$tmp/$name-control.fifo"
    IFS= read -r ready <&3
    test "$ready" = 'native filesystem ready'
    (sleep 1; case "$operation" in
      json-write) cat < "$tmp/$name.fifo" > "$tmp/$name.data";;
      json-read) printf '%s' '{"value":"worker"}' > "$tmp/$name.fifo";;
      text) printf worker > "$tmp/$name.fifo";;
    esac) &
    writer=$!
    cat <&3 > "$tmp/$name.out"
    exec 3<&-
    wait "$child"; child=""
    wait "$writer"; writer=""
    test "$(cat "$tmp/$name.out")" = 'native filesystem scheduling passed'
    if test "$operation" = json-write; then grep -q '"value": "worker"' "$tmp/$name.data"; fi
    printf '%s\n' "performance: $mode $operation worker leaves timers runnable"
  done
done
