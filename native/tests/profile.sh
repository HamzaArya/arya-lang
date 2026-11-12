#!/bin/sh
# Native standard-library and runtime acceptance; no JS/Python interpreter.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/native-profile.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for name in arrays regex host-values async-semantics typed-standard services testing security files path web-events accounting finance-values csv-stream chunks; do
  "$compiler" build "$root/native/tests/fixtures/$name.arya" -o "$tmp/$name" --debug --sanitize > "$tmp/$name.build.log" 2>&1 || { cat "$tmp/$name.build.log" >&2; exit 1; }
  set --
  case "$name" in
    security) set -- "$root/native/tests/data/arya-secure-v1.json";;
    files) mkdir "$tmp/files-data"; set -- "$tmp/files-data";;
    path) set -- --stream;;
    finance-values) set -- --stress;;
  esac
  if test "$name" = chunks; then
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" < "$root/native/tests/data/chunks.input" > "$tmp/$name.log" 2>&1 || { cat "$tmp/$name.log" >&2; exit 1; }
  elif test "$name" = path; then
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" "$@" < "$root/native/tests/fixtures/path-vectors.jsonl" > "$tmp/$name.log" 2>&1 || { cat "$tmp/$name.log" >&2; exit 1; }
  else
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" "$@" > "$tmp/$name.log" 2>&1 || { cat "$tmp/$name.log" >&2; exit 1; }
  fi
  printf '%s\n' "$name: native ASan/UBSan and GC stress passed"
  if test "$name" = finance-values; then
    env -i PATH=/nonexistent ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$name" > "$tmp/finance-large.log" 2>&1 || { cat "$tmp/finance-large.log" >&2; exit 1; }
    printf '%s\n' 'finance: large prepared batches and cooperative cancellation passed'
  fi
done
if test "$(uname -s)" = Darwin; then
  "$compiler" build "$root/native/tests/fixtures/glob.arya" -o "$tmp/glob" --debug --sanitize > "$tmp/glob.build.log" 2>&1
  env -i PATH=/nonexistent ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/glob" "$root/native/tests/fixtures/glob-vectors.json" > "$tmp/glob.log" 2>&1 || { cat "$tmp/glob.log" >&2; exit 1; }
  printf '%s\n' 'glob: 4368 native reference cases passed'
fi
printf '%s\n' 'profile: optional Python, live MySQL, desktop and editor host have separate integration gates'
