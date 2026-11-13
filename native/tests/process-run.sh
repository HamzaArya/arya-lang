#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_COMPILER:-$root/.build/independent/arya}
work=$(mktemp -d "$root/.build/process-run.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
for mode in release debug; do
  binary="$work/process $mode"
  "$compiler" build "$root/native/tests/fixtures/process-run.arya" -o "$binary" "--$mode" > "$work/$mode.build.log" 2>&1 || { cat "$work/$mode.build.log" >&2; exit 1; }
  ln -s "$binary" "$work/arya-process-probe"
  PATH="$work:$PATH" ARYA_PROCESS_PROBE=inherited ARYA_GC_STRESS=1 "$binary" arya-process-probe > "$work/$mode.stdout" 2> "$work/$mode.stderr" || { cat "$work/$mode.stdout" "$work/$mode.stderr" >&2; exit 1; }
  grep -q '^process.run: argv, Unicode, PATH, environment, exit status and async task spawning passed$' "$work/$mode.stdout"
  grep -q '^Cannot start /arya-nonexistent-process-for-test:' "$work/$mode.stderr"
  cat "$work/$mode.stdout"
  rm "$work/arya-process-probe"
done
