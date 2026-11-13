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
if test "$(uname -s)" = Darwin; then
  cc -fobjc-arc -Wall -Wextra "$root/native/gui/appkit-test.m" -framework Cocoa -o "$tmp/actions"
  "$tmp/actions"
fi
printf '%s\n' 'native gui: public types and real platform controls passed'
