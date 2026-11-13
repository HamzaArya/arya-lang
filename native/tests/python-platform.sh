#!/bin/sh
set -eu
case $(uname -s) in CYGWIN*) ;; *) printf '%s\n' 'Python platform rejection gate requires Windows Cygwin.' >&2; exit 1;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
work=$(mktemp -d "$root/.build/python-platform.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
cat > "$work/must-not-start" <<'SH'
#!/bin/sh
printf unexpected > "$ARYA_PYTHON_MARKER"
exit 91
SH
chmod +x "$work/must-not-start"
for mode in release debug; do
  "$compiler" build "$root/native/tests/fixtures/python-platform.arya" -o "$work/$mode" "--$mode" > "$work/$mode.build.log" 2>&1 || { cat "$work/$mode.build.log" >&2; exit 1; }
  ARYA_PYTHON="$work/must-not-start" ARYA_PYTHON_MARKER="$work/started" ARYA_GC_STRESS=1 "$work/$mode" "$work/must-not-start"
  test ! -e "$work/started"
done
