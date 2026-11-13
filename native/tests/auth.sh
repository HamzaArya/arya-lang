#!/bin/sh
# Native auth acceptance. No real prompts, enrollment or Keychain writes.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/auth-tests.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in release sanitized; do
  set -- --release
  if test "$mode" = sanitized; then set -- --debug --sanitize; fi
  "$compiler" build "$root/native/tests/fixtures/auth.arya" -o "$tmp/$mode" "$@" > "$tmp/$mode.build.log" 2>&1 || { cat "$tmp/$mode.build.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/$mode" > "$tmp/$mode.out" 2> "$tmp/$mode.err" || { cat "$tmp/$mode.err" >&2; exit 1; }
  cat "$tmp/$mode.out"
done
diff -u "$tmp/release.out" "$tmp/sanitized.out"
"$compiler" build "$root/native/tests/fixtures/auth-passwords.arya" -o "$tmp/passwords" --release > "$tmp/passwords.build.log" 2>&1 || { cat "$tmp/passwords.build.log" >&2; exit 1; }
env -i PATH=/nonexistent ARYA_GC_STRESS=1 "$tmp/passwords"
"$compiler" build "$root/native/tests/fixtures/auth-types.arya" -o "$tmp/types" --release > "$tmp/types.build.log" 2>&1 || { cat "$tmp/types.build.log" >&2; exit 1; }
env -i PATH=/nonexistent ARYA_GC_STRESS=1 "$tmp/types"
# Recompile the actual emitted application through the non-Apple adapter path,
# even on macOS. This asserts that unavailable native auth cannot succeed.
"$compiler" build "$root/native/tests/fixtures/auth-portable.arya" -o "$tmp/portable-source" --release > "$tmp/portable.build.log" 2>&1 || { cat "$tmp/portable.build.log" >&2; exit 1; }
set --
if test "$(uname -s)" = Linux; then set -- -ldl; fi
cc -std=c11 -O1 -DARYA_AUTH_PORTABLE=1 -ffp-contract=off -fsanitize=address,undefined -fno-omit-frame-pointer \
  -I "$root/.build/independent/lib" -I "$root/.build/independent/lib/include" \
  "$tmp/portable-source.c" "$root/.build/independent/lib/libmpdec.a" "$root/.build/independent/lib/libcrypto.a" -lm -pthread "$@" -o "$tmp/portable" > "$tmp/portable-cc.log" 2>&1 || { cat "$tmp/portable-cc.log" >&2; exit 1; }
env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/portable"
# Compile the production Objective-C adapter with test-only OS dependency seams.
# The resulting application exercises its real cancellation/ACL/lifetime code.
if test "$(uname -s)" = Darwin; then
  "$compiler" build "$root/native/tests/fixtures/auth-biometric.arya" -o "$tmp/biometric-source" --release > "$tmp/biometric.build.log" 2>&1 || { cat "$tmp/biometric.build.log" >&2; exit 1; }
  cc -fobjc-arc -O1 -fsanitize=address,undefined -fno-omit-frame-pointer -c "$root/native/tests/auth-platform.m" -o "$tmp/biometric-adapter.o" > "$tmp/biometric-adapter.log" 2>&1 || { cat "$tmp/biometric-adapter.log" >&2; exit 1; }
  cc -std=c11 -O1 -ffp-contract=off -fsanitize=address,undefined -fno-omit-frame-pointer \
    -I "$root/.build/independent/lib" -I "$root/.build/independent/lib/include" \
    "$tmp/biometric-source.c" "$tmp/biometric-adapter.o" "$root/.build/independent/lib/libmpdec.a" "$root/.build/independent/lib/libcrypto.a" \
    -framework Foundation -framework LocalAuthentication -framework Security -lm -pthread -o "$tmp/biometric" > "$tmp/biometric-cc.log" 2>&1 || { cat "$tmp/biometric-cc.log" >&2; exit 1; }
  env -i PATH=/nonexistent ARYA_GC_STRESS=1 ASAN_OPTIONS=detect_leaks=0 UBSAN_OPTIONS=halt_on_error=1 "$tmp/biometric"
fi
# Public contracts participate in compiler checking, including nested methods.
printf 'use std "auth" as auth\nconst enabled: boolean = true\nif enabled { auth.sessions({ttlSeconds: "wrong"}) }\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/type.log" 2>&1; then exit 1; fi
grep -q 'Type mismatch' "$tmp/type.log"
printf 'use std "auth" as auth\nconst enabled: boolean = true\nconst store = auth.sessions()\nif enabled { store.issue(42) }\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/method.log" 2>&1; then exit 1; fi
grep -q 'Type mismatch' "$tmp/method.log"
printf 'use std "auth" as auth\nconst enabled: boolean = true\nconst controller = new AbortController()\nconst settings = {reason: "Test typed options", timeoutMs: "wrong", signal: controller.signal}\nif enabled { auth.authenticate(settings) }\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/local-types.log" 2>&1; then exit 1; fi
grep -q 'Type mismatch' "$tmp/local-types.log"
printf 'use std "auth" as auth\nconst enabled: boolean = true\nconst vault = auth.vault({service: "org.arya.types"})\nif enabled { vault.replace("account", 42, "Test typed replacement") }\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/replace-types.log" 2>&1; then exit 1; fi
grep -q 'Type mismatch' "$tmp/replace-types.log"
printf '%s\n' 'auth: RFC vectors, state transitions, expiry, GC, ASan/UBSan, portable denial, native biometric cancellation/ACLs and public types passed'
