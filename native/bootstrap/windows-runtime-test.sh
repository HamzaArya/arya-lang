#!/bin/sh
# Windows/Cygwin has a native PE runtime, but its GCC package may omit ASan.
# Probe that capability separately and retain the exact result as release evidence.
set -eu
case $(uname -s) in CYGWIN*) ;; *) printf '%s\n' 'This gate requires Windows Cygwin.' >&2; exit 1;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
export LC_ALL=C.UTF-8
mkdir -p .build/release-evidence
work=$(mktemp -d "$root/.build/windows-runtime.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
. "$root/native/tests/runtime-path.sh"
arya_test_prepare_runtime_path "$work"
printf '%s\n' 'Isolated Windows tests use empty POSIX PATH; Cygwin supplies its native DLL loader directory.'
cat > "$work/isolation.c" <<'C'
#include <stdio.h>
#include <stdlib.h>
int main(void) {
  const char *path = getenv("PATH");
  if (!path || *path) return 1;
  puts("Empty POSIX PATH: native DLL loading and absolute C toolchain passed.");
  return 0;
}
C
env -i PATH= "$(command -v gcc)" "$work/isolation.c" -o "$work/isolation.exe" > .build/release-evidence/windows-path-isolation.log 2>&1 || { cat .build/release-evidence/windows-path-isolation.log >&2; exit 1; }
env -i PATH= "$work/isolation.exe" >> .build/release-evidence/windows-path-isolation.log 2>&1 || { cat .build/release-evidence/windows-path-isolation.log >&2; exit 1; }
cat .build/release-evidence/windows-path-isolation.log
printf '%s\n' 'int main(void) { return 0; }' > "$work/probe.c"
if gcc -fsanitize=address,undefined "$work/probe.c" -o "$work/probe.exe" > .build/release-evidence/windows-sanitizer-capability.log 2>&1 && "$work/probe.exe" >> .build/release-evidence/windows-sanitizer-capability.log 2>&1; then
  export ARYA_TEST_SANITIZERS=required
  printf '%s\n' 'ASan/UBSan supported by the actual Cygwin compiler.' >> .build/release-evidence/windows-sanitizer-capability.log
else
  export ARYA_TEST_SANITIZERS=unavailable
  printf '%s\n' 'ASan/UBSan unavailable: Windows gates use release/debug + GC stress. Instrumentation is qualified separately on macOS/Linux.' >> .build/release-evidence/windows-sanitizer-capability.log
fi
cat .build/release-evidence/windows-sanitizer-capability.log
failed=0
for gate in run array-empty collection-mutation process-run python-platform bitwise32 decimal-remainder security-bytes editor-paths gui; do
  if sh "native/tests/$gate.sh" > ".build/release-evidence/windows-$gate.log" 2>&1; then
    printf 'Windows gate PASS: %s\n' "$gate"
  else
    printf 'Windows gate FAIL: %s\n' "$gate" >&2
    failed=1
  fi
  cat ".build/release-evidence/windows-$gate.log"
done
for gate in api-contracts web-relocation; do
  if python3 "native/tests/$gate.py" > ".build/release-evidence/windows-$gate.log" 2>&1; then
    printf 'Windows gate PASS: %s\n' "$gate"
  else
    printf 'Windows gate FAIL: %s\n' "$gate" >&2
    failed=1
  fi
  cat ".build/release-evidence/windows-$gate.log"
done
exit "$failed"
