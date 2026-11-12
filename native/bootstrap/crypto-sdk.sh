#!/bin/sh
# Build the pinned, vendored C crypto library. Perl is upstream configuration only.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
archive="$root/native/vendor/openssl/openssl-3.6.4.tar.gz"
expected=$(awk '{print $1}' "$archive.sha256")
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$archive" | awk '{print $1}'); else actual=$(shasum -a 256 "$archive" | awk '{print $1}'); fi
test "$actual" = "$expected" || { printf '%s\n' 'OpenSSL source integrity check failed.' >&2; exit 1; }
mkdir -p "$root/.build" "$root/.build/openssl-native" "$root/.build/independent/lib/include"
if test ! -f "$root/.build/openssl-3.6.4/Configure"; then tar -xzf "$archive" -C "$root/.build"; fi
cd "$root/.build/openssl-native"
if test ! -f Makefile; then perl ../openssl-3.6.4/Configure no-shared no-tests no-apps no-docs no-module no-dso no-engine --prefix=/arya-native --libdir=lib; fi
make -j4 build_libs
make install_dev DESTDIR="$root/.build/openssl-native/installed"
cp installed/arya-native/lib/libcrypto.a "$root/.build/independent/lib/libcrypto.a.new"
mv -f "$root/.build/independent/lib/libcrypto.a.new" "$root/.build/independent/lib/libcrypto.a"
cp -R installed/arya-native/include/openssl "$root/.build/independent/lib/include/"
printf '%s\n' "$actual" > "$root/.build/independent/lib/openssl-source.sha256"
