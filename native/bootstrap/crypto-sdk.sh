#!/bin/sh
# Build the pinned, vendored C crypto library. Perl is upstream configuration only.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=3.5.9
archive="$root/native/vendor/openssl/openssl-$version.tar.gz"
expected=$(awk '{print $1}' "$archive.sha256")
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$archive" | awk '{print $1}'); else actual=$(shasum -a 256 "$archive" | awk '{print $1}'); fi
test "$actual" = "$expected" || { printf '%s\n' 'OpenSSL source integrity check failed.' >&2; exit 1; }
# The build identity includes the verified source hash: upgrading the archive
# must never reuse a Makefile configured against an older source tree.
build="$root/.build/openssl-native-$version-$actual"
mkdir -p "$build" "$root/.build/independent/lib/include"
if test ! -f "$build/openssl-$version/Configure"; then tar -xzf "$archive" -C "$build"; fi
cd "$build"
perl "./openssl-$version/Configure" no-shared no-tests no-apps no-docs no-module no-dso no-engine --prefix=/arya-native --libdir=lib
make -j4 build_libs
make install_dev DESTDIR="$build/installed"
cp installed/arya-native/lib/libcrypto.a "$root/.build/independent/lib/libcrypto.a.new"
mv -f "$root/.build/independent/lib/libcrypto.a.new" "$root/.build/independent/lib/libcrypto.a"
# Replace headers as a set so headers removed upstream cannot survive an update.
rm -rf "$root/.build/independent/lib/include/openssl.new"
cp -R installed/arya-native/include/openssl "$root/.build/independent/lib/include/openssl.new"
rm -rf "$root/.build/independent/lib/include/openssl"
mv "$root/.build/independent/lib/include/openssl.new" "$root/.build/independent/lib/include/openssl"
printf '%s\n' "$actual" > "$root/.build/independent/lib/openssl-source.sha256"
