#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compiler=${ARYA_COMPILER:-$root/.build/independent/arya}
work=$(mktemp -d "$root/.build/editor-path-tests.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
cp "$root/native/compiler/file-uri.arya" "$work/file-uri.arya"
cp "$root/native/tests/fixtures/file-uri.arya" "$work/main.arya"
"$compiler" check "$work/main.arya"
"$compiler" build "$work/main.arya" -o "$work/paths" --release
"$work/paths"
