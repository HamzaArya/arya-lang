#!/bin/sh
# Run before the expensive bootstrap to qualify the actual loader/toolchain.
set -eu
case $(uname -s) in CYGWIN*) ;; *) exit 1;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
mkdir -p "$root/.build/release-evidence"
work=$(mktemp -d "$root/.build/windows-path.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
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
log="$root/.build/release-evidence/windows-path-isolation.log"
env -i PATH= "$(command -v gcc)" "$work/isolation.c" -o "$work/isolation.exe" > "$log" 2>&1 || { cat "$log" >&2; exit 1; }
env -i PATH= "$work/isolation.exe" >> "$log" 2>&1 || { cat "$log" >&2; exit 1; }
cat "$log"
