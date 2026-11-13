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
for gate in run array-empty collection-mutation process-run python-platform bitwise32 decimal-remainder security-bytes security-diagnostics editor-paths gui; do
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
