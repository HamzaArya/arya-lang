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
for gate in run array-empty collection-mutation process-run python-platform bitwise32 decimal-remainder security-bytes editor-paths gui; do
  sh "native/tests/$gate.sh" > ".build/release-evidence/windows-$gate.log" 2>&1 || { cat ".build/release-evidence/windows-$gate.log" >&2; exit 1; }
  cat ".build/release-evidence/windows-$gate.log"
done
python3 native/tests/api-contracts.py > .build/release-evidence/windows-api-contracts.log 2>&1 || { cat .build/release-evidence/windows-api-contracts.log >&2; exit 1; }
cat .build/release-evidence/windows-api-contracts.log
python3 native/tests/web-relocation.py > .build/release-evidence/windows-web-relocation.log 2>&1 || { cat .build/release-evidence/windows-web-relocation.log >&2; exit 1; }
cat .build/release-evidence/windows-web-relocation.log
