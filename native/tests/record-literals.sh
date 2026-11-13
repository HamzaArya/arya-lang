#!/bin/sh
# Native record composition, type contracts, formatting and source diagnostics.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
library=${ARYA_NATIVE_LIBDIR:-$(CDPATH= cd -- "$(dirname -- "$compiler")/lib" && pwd)}
work=$(mktemp -d "$root/.build/record-literals.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
for mode in optimized reference sanitized; do
  set -- --release
  if test "$mode" = reference; then set -- --release --no-data-opt --no-call-opt; fi
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/record-literals.arya" -o "$work/$mode" "$@" > "$work/$mode.build.log" 2>&1 || { cat "$work/$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/$mode" > "$work/$mode.out" 2> "$work/$mode.err" || { cat "$work/$mode.err" >&2; exit 1; }
  if test "$mode" != optimized; then diff -u "$work/optimized.out" "$work/$mode.out"; fi
  cat "$work/$mode.out"
  if test "$mode" != reference; then
    set -- -O3
    if test "$mode" = sanitized; then set -- -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer; fi
    "${ARYA_CC:-${CC:-cc}}" -std=c11 "$@" -ffp-contract=off -Wno-deprecated-declarations -I "$library" "-DARYA_RECORD_LITERALS_SOURCE=\"$work/$mode.c\"" "$root/native/tests/record-literals-probe.c" -o "$work/probe-$mode" "$library/libmpdec.a" -lm -pthread > "$work/probe-$mode.build.log" 2>&1 || { cat "$work/probe-$mode.build.log" >&2; exit 1; }
    env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$work/probe-$mode"
  fi
done
"$compiler" build "$root/native/tests/fixtures/record-literals-error.arya" -o "$work/error" --release > "$work/error.build.log" 2>&1
if env -i PATH=/nonexistent "$work/error" > "$work/error.out" 2> "$work/error.err"; then exit 1; fi
grep -q 'record-literals-error.arya:3:' "$work/error.err"
grep -q 'Record spread requires a record.' "$work/error.err"
reject() {
  printf '%s\n' "$1" > "$work/invalid.arya"
  if "$compiler" check "$work/invalid.arya" > "$work/invalid.log" 2>&1; then cat "$work/invalid.arya" >&2; exit 1; fi
  grep -Fq "$2" "$work/invalid.log" || { cat "$work/invalid.log" >&2; exit 1; }
}
reject 'const mark: number = 1; const value = {...[1, 2]}' 'Record spread requires a record'
reject 'const input: unknown = {}; const value = {...input}' 'Record spread requires a record'
reject 'const mark: number = 1; const value = {...null}' 'Record spread requires a record'
reject 'const mark: number = 1; const value = {[1]: 2}' 'Computed record keys must be strings'
reject 'const value = {missing}' 'Unknown or unsupported native name'
reject 'const value = {if}' 'Record shorthand requires a binding name'
reject 'const value = {"text"}' 'Record shorthand requires a binding name'
reject 'const value = {...}' 'Expected a value'
reject 'const value = {["x"] 1}' "Expected ':'"
reject 'const value = {["x"]: 1}; const text: string = value.x' 'Type mismatch'
reject 'const base = {amount: 1}; const result = {...base, amount: "text"}; const bad: number = result.amount' 'Type mismatch'
reject 'fn copy(value: {amount?: number}) { return {...value} }; const bad: number = copy({}).amount' 'Type mismatch'
reject 'fn merge(value: {amount?: string}) { return {amount: 1, ...value} }; const bad: number = merge({}).amount' 'Type mismatch'
reject 'const base: {items: number[]} = {items: [1]}; const unsafe: {items: number[] | string[]} = {...base}' 'Type mismatch'
# Getter execution during spread invalidates a captured narrowing.
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { const copy = {...source}; const unsafe: number = value }' 'Type mismatch'
# Computed keys may run getters before the field value and later statements.
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "key", fn() { value = null; return "x" }); if value != null { const copy = {[source.key]: value}; const unsafe: number = value }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { const copy = {["prefix" + source.key]: value}; const unsafe: number = value }' 'Type mismatch'
# General member reads apply getter effects at the read, including inside
# computed keys, earlier call arguments/callees and short-circuit operands.
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: {key: string} = {key: "x"}; runtime.fieldGetter(source, "key", fn() { value = null; return "x" }); if value != null { const copy = {[source.key + (value * 2)]: 1} }' 'requires number operands'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "key", fn() { value = null; return "x" }); fn consume(key: string, amount: number) { return amount }; if value != null { consume(source.key, value) }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: {run: fn(number): number} = {run: fn(amount: number): number { return amount }}; runtime.fieldGetter(source, "run", fn() { value = null; return fn(amount: number): number { return amount } }); if value != null { source.run(value) }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "ready", fn() { value = null; return true }); if value != null and source.ready { const unsafe: number = value }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "ready", fn() { value = null; return true }); if value != null { const ready = source.ready and (value * 2 > 0) }' 'requires number operands'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "key", fn() { value = null; return null }); if value != null { const key = source.key ?? (value * 2) }' 'requires number operands'
reject 'let value: number | null = 1; fn change() { value = null }; fn inspect(source: {key: string} | null) { if value != null { const key = source?.key; const unsafe: number = value } }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; fn inspect(source: {length: number} | string) { if value != null { const size = source.length; const unsafe: number = value } }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; fn source() { return 1 }; runtime.fieldGetter(source, "key", fn() { value = null; return "x" }); if value != null { const key = source.key; const unsafe: number = value }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: {amount: number} = {amount: 0}; runtime.fieldGetter(source, "amount", fn() { value = null; return 1 }); if value != null { source.amount += value * 2 }' 'requires number operands'
# Effects survive restored loop/exception states, including later iterations
# and finally paths reached by an exception or an early return.
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "ready", fn() { value = null; return false }); if value != null { while source.ready {}; const unsafe: number = value }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "ready", fn() { value = null; throw "failure" }); if value != null { try { const ready = source.ready } catch failure { const unsafe: number = value } }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { while true { const ready = source.ready; break }; const unsafe: number = value }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { for item in [1] { const ready = source.ready }; const unsafe: number = value }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { while true { const unsafe: number = value; const ready = source.ready } }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { for item in [1, 2] { const unsafe: number = value; const ready = source.ready } }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "rows", fn() { value = null; return [] }); if value != null { for item in source.rows {}; const unsafe: number = value }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null; throw "failure" }; if value != null { try { change() } catch failure { const unsafe: number = value } }' 'Type mismatch'
reject 'use std "runtime" as runtime; let value: number | null = 1; const source: any = {}; runtime.fieldGetter(source, "ready", fn() { value = null; throw "failure" }); if value != null { try { const ready = source.ready } finally { const unsafe: number = value } }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; fn inspect(flag: boolean) { if value != null { try { if flag { const ready = source.ready; return } } finally { const unsafe: number = value } } }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if not (value == null or source.ready) { const unsafe: number = value }' 'Type mismatch'
reject 'let value: number | null = 1; fn change() { value = null }; const source: any = {}; if value != null { if true { const ready = source.ready }; const unsafe: number = value }' 'Type mismatch'
reject 'fn inspect(value: number | null) { while value == null { break }; const unsafe: number = value; return unsafe }; inspect(null)' 'Type mismatch'
reject 'let value: number | null = null; fn change() { value = null }; const source: any = {}; while value == null { const ready = source.ready; break }; const unsafe: number = value' 'Type mismatch'
cat > "$work/pure-keys.arya" <<'ARYA'
let value: number | null = 1
fn change() { value = null }
const key = "amount"
if value != null {
  const literal = {["amount"]: value}
  const named = {[key]: value}
  const stillNarrowed: number = value
  const compound = {[key + "_total"]: value}
  const afterCompound: number = value
  const amount: number = literal.amount
}
# Ordinary locals cannot be changed by unrelated getters. Primitive/array
# property reads and simple member writes do not call record getters either.
fn ordinaryLocal(source: {ready: boolean} | null, input: number | null) {
  let local: number | null = input
  if local != null {
    const ready = source?.ready
    const amount: number = local
    if source?.ready and local > 0 { const positive: number = local }
  }
}
fn ordinaryControlFlow(source: any, local: number | null) {
  if local != null and source.ready { const narrowed: number = local }
  if not (local == null or source.ready) { const alsoNarrowed: number = local }
  if local != null {
    while source.ready { break }
    const afterLoop: number = local
    try { const ready = source.ready } catch failure { const inCatch: number = local }
    const afterCatch: number = local
  }
}
if value != null {
  const size = "text".length
  const count = [1, 2].length
  const afterLengths: number = value
  const source = {amount: 0}
  source.amount = 2
  const afterWrite: number = value
}
const source = {key: "x", ready: true}
fn consume(amount: number, key: string) { return amount }
if value != null { consume(value, source.key) }
if value != null {
  const snapshot = value
  const key = source.key
  const safeSnapshot: number = snapshot
}
if source.ready and value != null { const rechecked: number = value }
if value != null {
  let running = false
  while running { fn neverCalled() { value = null }; running = false }
  const afterPureLoop: number = value
  while false { const unreachable = source.ready }
  const afterDeadLoop: number = value
  try { const marker = 1; fn alsoNeverCalled() { value = null } } catch failure { const inPureCatch: number = value }
  const afterPureCatch: number = value
}
if value != null and (fn() { value = null }) { const afterClosureCreation: number = value }
fn conditionExit(local: number | null): number { while local == null { local = 1 }; return local }
if value != null {
  const snapshot = value
  try { const ready = source.ready } catch failure { if value != null { const rechecked: number = value } }
  finally { const saved: number = snapshot }
}
ARYA
"$compiler" check "$work/pure-keys.arya"
cat > "$work/format.arya" <<'ARYA'
const name = "Arya"
const source = {name}
const value = {
...source,
["safe"]: true,
name,
}
print(value)
ARYA
"$compiler" fmt "$work/format.arya"
cp "$work/format.arya" "$work/once.arya"
"$compiler" fmt "$work/format.arya"
cmp "$work/format.arya" "$work/once.arya"
"$compiler" fmt "$work/format.arya" --check
"$compiler" check "$work/format.arya"
# New computed/spread expressions retain the existing parser depth bound.
awk 'BEGIN { printf "const value = "; for(i=0;i<110;i++)printf "{...";printf "{}";for(i=0;i<110;i++)printf "}";printf "\n" }' > "$work/deep.arya"
if "$compiler" check "$work/deep.arya" > "$work/deep.log" 2>&1; then exit 1; fi
grep -q 'nested\|nesting' "$work/deep.log"
printf '%s\n' 'record literals: GC/sanitizers, ordering, getters, shallow aliases, typed rejection, formatter and parser limits passed'
