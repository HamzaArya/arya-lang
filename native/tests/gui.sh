#!/bin/sh
# Actual native controls; requires AppKit session, Win32 desktop or GTK display.
# Linux CI: xvfb-run -a sh native/tests/gui.sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_NATIVE_BIN:-$root/.build/independent/arya}
tmp=$(mktemp -d "$root/.build/gui-tests.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"$compiler" check "$root/native/tests/fixtures/gui.arya"
"$compiler" build "$root/native/tests/fixtures/gui.arya" -o "$tmp/widgets" --release > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; exit 1; }
ARYA_GC_STRESS=1 "$tmp/widgets"
printf 'use std "gui" as gui\nconst typed: boolean = true\nconst w = gui.window({width: "wrong"})\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/check.log" 2>&1; then printf '%s\n' 'GUI invalid width escaped type checking.' >&2; exit 1; fi
grep -q 'Type mismatch' "$tmp/check.log"
printf 'use std "gui" as gui\nconst typed: boolean = true\nconst w = gui.window()\nw.set("x", {enabled: "wrong"})\n' > "$tmp/invalid.arya"
if "$compiler" check "$tmp/invalid.arya" > "$tmp/check.log" 2>&1; then printf '%s\n' 'GUI invalid enabled escaped type checking.' >&2; exit 1; fi
grep -q 'Type mismatch' "$tmp/check.log"
"$compiler" create "$tmp/project" --template native-gui
"$compiler" check "$tmp/project/main.arya"
"$compiler" build "$tmp/project/main.arya" -o "$tmp/template" --release > "$tmp/template.log" 2>&1 || { cat "$tmp/template.log" >&2; exit 1; }
case $(uname -s) in
  Darwin) cc -fobjc-arc -Wall -Wextra "$root/native/gui/appkit-test.m" -framework Cocoa -o "$tmp/actions" ;;
  Linux) cc -std=c11 -Wall -Wextra $(pkg-config --cflags gtk+-3.0) "$root/native/gui/platform-test.c" $(pkg-config --libs gtk+-3.0) -o "$tmp/actions" ;;
  CYGWIN*|MINGW*|MSYS*) cc -std=c11 -Wall -Wextra "$root/native/gui/platform-test.c" -lcomctl32 -lgdi32 -luser32 -o "$tmp/actions" ;;
  *) printf '%s\n' 'No native toolkit action probe for this platform.' >&2; exit 1 ;;
esac
"$tmp/actions"
printf '%s\n' 'native gui: public types and real platform controls passed'
