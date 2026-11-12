#!/bin/sh
# Isolated self-hosted stages; leave the user's installed/baseline SDK intact.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
test "$#" -eq 2 || { echo 'usage: build-candidate.sh baseline-compiler empty-sdk-directory' >&2; exit 2; }
compiler=$1
sdk=$2
test ! -e "$sdk" || { echo "SDK destination exists: $sdk" >&2; exit 1; }
mkdir -p "$sdk/stdlib"
cp "$root"/native/compiler/*.arya "$sdk/"
cp "$root"/native/libraries/*.arya "$sdk/stdlib/"
ln -s "$root/.build/independent/lib" "$sdk/lib"
"$root/.build/independent/embed" "$root/native/runtime/core.c" "$sdk/runtime-source.arya" "$root/native/vendor/ryu"
export ARYA_NATIVE_LIBDIR="$root/.build/independent/lib"
"$compiler" build "$sdk/compiler.arya" -o "$sdk/stage1" --release --force
"$sdk/stage1" build "$sdk/compiler.arya" -o "$sdk/stage2" --release --force
"$sdk/stage2" build "$sdk/compiler.arya" -o "$sdk/arya" --release --force
cmp "$sdk/stage2.c" "$sdk/arya.c"
"$sdk/arya" --version
