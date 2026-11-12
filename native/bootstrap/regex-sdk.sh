#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root"
archive=native/vendor/pcre2/pcre2-10.49.tar.gz
expected=929f0b20e62879252a15886b06c89f1edef61a363cbd5826fb041080a5e557ae
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$archive" | cut -d ' ' -f 1); else actual=$(shasum -a 256 "$archive" | cut -d ' ' -f 1); fi
test "$actual" = "$expected" || { echo 'PCRE2 source checksum mismatch' >&2; exit 1; }
test -f .build/pcre2-10.49/configure || tar -xzf "$archive" -C .build
mkdir -p .build/pcre2-native .build/independent/lib/include
if ! test -f .build/pcre2-native/Makefile; then
  (cd .build/pcre2-native && ../pcre2-10.49/configure --disable-shared --enable-static --disable-pcre2-8 --enable-pcre2-16 --disable-pcre2grep --disable-pcre2test --disable-jit)
fi
make -C .build/pcre2-native -j2 libpcre2-16.la
cp .build/pcre2-native/.libs/libpcre2-16.a .build/independent/lib/libpcre2-16.a.new
mv .build/independent/lib/libpcre2-16.a.new .build/independent/lib/libpcre2-16.a
cp .build/pcre2-native/src/pcre2.h .build/independent/lib/include/
