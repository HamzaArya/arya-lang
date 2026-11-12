#!/bin/sh
# Core acceptance uses only the native compiler, C toolchain and POSIX utilities.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/native-check.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for name in core decimal list json; do
  "$compiler" build "$root/native/tests/fixtures/$name.arya" -o "$tmp/$name" --release > "$tmp/$name.build.log" 2>&1
  env -i PATH=/nonexistent "$tmp/$name" > "$tmp/$name.actual"
  diff -u "$root/native/tests/fixtures/$name.expected" "$tmp/$name.actual"
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 "$tmp/$name" > "$tmp/$name.stress"
  diff -u "$root/native/tests/fixtures/$name.expected" "$tmp/$name.stress"
  printf '%s\n' "$name: native output and GC stress passed"
done
mkdir "$tmp/modules"
cat > "$tmp/modules/helper.arya" <<'ARYA'
export let current = 1
export fn next() { current += 1; return current }
ARYA
cat > "$tmp/modules/main.arya" <<'ARYA'
use arya "./helper.arya" as helper
print(helper.current, helper.next(), helper.current)
ARYA
"$compiler" build "$tmp/modules/main.arya" -o "$tmp/modules/main" --release > "$tmp/modules.log" 2>&1
env -i PATH=/nonexistent "$tmp/modules/main" > "$tmp/module.actual"
printf '1 2 2\n' > "$tmp/module.expected"
diff -u "$tmp/module.expected" "$tmp/module.actual"
printf '%s\n' 'modules: live native exports passed'
# Existing outputs, including symlinks, must remain intact.
printf 'keep this file\n' > "$tmp/existing"
cp "$tmp/existing" "$tmp/original"
if "$compiler" build "$root/native/tests/fixtures/core.arya" -o "$tmp/existing" > "$tmp/exists.log" 2>&1; then exit 1; fi
cmp "$tmp/existing" "$tmp/original"
ln -s "$tmp/missing-target" "$tmp/dangling"
if "$compiler" build "$root/native/tests/fixtures/core.arya" -o "$tmp/dangling" > "$tmp/link.log" 2>&1; then exit 1; fi
test -L "$tmp/dangling"; test ! -e "$tmp/dangling.c"; test ! -e "$tmp/dangling.NOTICE"
printf '%s\n' 'publication: existing file and dangling symlink preserved'
cat > "$tmp/invalid.arya" <<'ARYA'
const value: number = "wrong"
ARYA
if "$compiler" check "$tmp/invalid.arya" > "$tmp/type.log" 2>&1; then exit 1; fi
grep -q 'Type mismatch' "$tmp/type.log"
printf 'const value = 1\nvalue = 2\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/const.log" 2>&1; then exit 1; fi
grep -q 'Cannot assign to const' "$tmp/const.log"
printf 'use std "unknown_library" as unavailable\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/pending.log" 2>&1; then exit 1; fi
printf '%s\n' 'diagnostics: invalid types, const writes and unknown imports rejected'
cat > "$tmp/tdz.arya" <<'ARYA'
fn sample(first = second, second = 2) { return first }
try { sample() } catch error { print(error.name) }
const task = 1
fn say(value) => value + task
print(say(2))
ARYA
"$compiler" build "$tmp/tdz.arya" -o "$tmp/tdz" --release > "$tmp/tdz.log" 2>&1
env -i PATH=/nonexistent "$tmp/tdz" > "$tmp/tdz.actual"
printf 'ReferenceError\n3\n' > "$tmp/tdz.expected"
diff -u "$tmp/tdz.expected" "$tmp/tdz.actual"
printf '%s\n' 'canonical syntax and default-parameter TDZ passed'
# The relocated compiler receives a native SDK and no JavaScript/runtime assets.
mkdir "$tmp/sdk" "$tmp/sdk/lib" "$tmp/tools"
cp "$compiler" "$tmp/sdk/arya"
cp "$root/.build/independent/lib/libmpdec.a" "$root/.build/independent/lib/mpdecimal.h" "$tmp/sdk/lib/"
cc_path=$(command -v cc)
ln -s "$cc_path" "$tmp/tools/cc"
cp "$root/native/tests/fixtures/decimal.arya" "$tmp/sdk/main.arya"
env -i PATH="$tmp/tools" "$tmp/sdk/arya" build "$tmp/sdk/main.arya" -o "$tmp/sdk/application" --release > "$tmp/sdk/build.log" 2>&1
env -i PATH=/nonexistent "$tmp/sdk/application" > "$tmp/sdk/actual"
diff -u "$root/native/tests/fixtures/decimal.expected" "$tmp/sdk/actual"
printf '%s\n' 'relocation: compiler and decimal program work without Node/Python'
if command -v otool >/dev/null 2>&1; then otool -L "$tmp/sdk/arya" "$tmp/sdk/application" > "$tmp/dependencies"; else ldd "$tmp/sdk/arya" "$tmp/sdk/application" > "$tmp/dependencies"; fi
if grep -Ei 'libnode|libpython|libv8|quickjs|javascriptcore' "$tmp/dependencies"; then exit 1; fi
printf '%s\n' 'native dependencies: no embedded JavaScript or Python runtime'
# Exercise the same generated code with memory/UB instrumentation.
"$compiler" build "$root/native/tests/fixtures/core.arya" -o "$tmp/sanitized" --sanitize --debug > "$tmp/sanitize.log" 2>&1
env -i PATH=/nonexistent ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 ARYA_GC_STRESS=1 "$tmp/sanitized" > "$tmp/sanitized.actual"
diff -u "$root/native/tests/fixtures/core.expected" "$tmp/sanitized.actual"
printf '%s\n' 'ASan/UBSan with GC stress passed (leak detection not run)'

"$compiler" build "$root/native/examples/calculation-worker.arya" -o "$tmp/worker" --release > "$tmp/worker.log" 2>&1
env -i PATH=/nonexistent "$tmp/worker" < "$root/native/tests/fixtures/bridge.input" > "$tmp/worker.actual"
diff -u "$root/native/tests/fixtures/bridge.expected" "$tmp/worker.actual"
printf '%s\n' 'native financial bridge: exact JSON-lines calculations passed'
cat > "$tmp/failing-cc" <<'SH'
#!/bin/sh
while test "$#" -gt 0; do
  if test "$1" = -o; then shift; printf partial > "$1"; break; fi
  shift
done
exit 19
SH
chmod +x "$tmp/failing-cc"
if "$compiler" build "$root/native/tests/fixtures/core.arya" -o "$tmp/failed" --cc "$tmp/failing-cc" > "$tmp/failed.log" 2>&1; then exit 1; fi
test ! -e "$tmp/failed"; test ! -e "$tmp/failed.c"; test ! -e "$tmp/failed.NOTICE"
if test -n "$(find "$tmp" -maxdepth 1 -name 'failed.arya-*' -print)"; then exit 1; fi
printf '%s\n' 'compiler failure: partial output and staging cleaned'

cat > "$tmp/forward.arya" <<'ARYA'
const value: number = twice(3)
fn twice(input: number): number => input * 2
print(value)
ARYA
"$compiler" build "$tmp/forward.arya" -o "$tmp/forward" > "$tmp/forward.log" 2>&1
test "$(env -i PATH=/nonexistent "$tmp/forward")" = 6
printf 'fn broken(value: boolean): number { if value { return 1 } }\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/returns.log" 2>&1; then exit 1; fi
grep -q 'every continuing path' "$tmp/returns.log"
printf 'fn twice(value: number): number => value * 2\nprint(twice())\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/arity.log" 2>&1; then exit 1; fi
grep -q 'argument count' "$tmp/arity.log"
printf '%s\n' 'typed functions: forward calls, return paths and arity verified'
