#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/accounting-journal.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release reference sanitized; do
  set -- --release
  if test "$mode" = reference; then set -- --release --no-call-opt --no-data-opt; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/accounting-journal.arya" -o "$tmp/$mode" "$@" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; exit 1; }
  if test "$mode" = sanitized; then
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" --stress
  else
    env -i PATH=/nonexistent "$tmp/$mode"
  fi
  "$compiler" build "$root/native/tests/fixtures/accounting-journal-lifetime.arya" -o "$tmp/lifetime-$mode" "$@" > "$tmp/lifetime.build.log" 2>&1 || { cat "$tmp/lifetime.build.log" >&2; exit 1; }
  if test "$mode" = sanitized; then
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/lifetime-$mode" --stress
  else
    env -i PATH=/nonexistent "$tmp/lifetime-$mode"
  fi
done
sdk=$(CDPATH= cd -- "$(dirname -- "$compiler")" && pwd)
lib=${ARYA_NATIVE_LIBDIR:-$sdk/lib}
"${CC:-cc}" -std=c11 -O0 -g -ffp-contract=off -fsanitize=address,undefined -fno-omit-frame-pointer \
  "-DARYA_ACCOUNTING_JOURNAL_SOURCE=\"$tmp/release.c\"" -I "$lib" \
  "$root/native/tests/accounting-journal-probe.c" "$lib/libmpdec.a" -lm -pthread -o "$tmp/snapshots" \
  > "$tmp/snapshots.build.log" 2>&1 || { cat "$tmp/snapshots.build.log" >&2; exit 1; }
# Explicit collections exercise ownership. GC stress on the 100000-name limit
# probe would turn construction into a quadratic collector benchmark.
env -i PATH=/nonexistent ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/snapshots"
"$compiler" check "$root/native/tests/fixtures/accounting-journal-types.arya" --json > "$tmp/types.check.json" || { cat "$tmp/types.check.json" >&2; exit 1; }
"$compiler" build "$root/native/tests/fixtures/accounting-journal-types.arya" -o "$tmp/typed" --release > "$tmp/types.build.log" 2>&1 || { cat "$tmp/types.build.log" >&2; exit 1; }
env -i PATH=/nonexistent "$tmp/typed"
# Reject incorrect amount annotations as well as accepting valid contracts:
# an accidental any result would otherwise make the positive smoke vacuous.
for expression in validation.debit prepared.currency direct.debit trial.debit statements.incomeStatement.netIncome; do
  cp "$root/native/tests/fixtures/accounting-journal-types.arya" "$tmp/rejected.arya"
  printf '\nconst wrongAmount: number = %s\n' "$expression" >> "$tmp/rejected.arya"
  if "$compiler" check "$tmp/rejected.arya" --json > "$tmp/rejected.json"; then
    printf '%s\n' "Checker accepted a numeric contract for $expression" >&2
    exit 1
  fi
  grep -q 'ARYA_TYPE' "$tmp/rejected.json"
done
printf '%s\n' 'journal/report types: valid shapes and five invalid amount contracts passed'
