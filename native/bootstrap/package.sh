#!/bin/sh
# Publish an immutable native SDK. Existing archives/checksums remain untouched.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(cat "$root/native/VERSION")
case "$version" in ''|*[!0-9A-Za-z.+-]*) printf '%s\n' 'Invalid native version' >&2; exit 1;; esac
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in aarch64) arch=arm64;; x86_64) arch=x64;; esac
name=arya-native-$version-$os-$arch
package_directory=${ARYA_PACKAGE_DIRECTORY:-$root/artifacts}
output=$package_directory/$name.tar.gz
for filename in "$output" "$output.sha256"; do
  if test -e "$filename" || test -L "$filename"; then printf '%s\n' "Refusing to replace $filename" >&2; exit 1; fi
done
mkdir -p "$root/.build" "$package_directory"
stage=$(mktemp -d "$root/.build/native-package.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
sh "$root/native/bootstrap/stage-sdk.sh" "$stage/$name"
case "$("$stage/$name/arya" --version)" in "Arya native $version "*) ;; *) printf '%s\n' 'SDK binary and source version differ' >&2; exit 1;; esac
COPYFILE_DISABLE=1 tar -czf "$stage/$name.tar.gz" -C "$stage" "$name"
digest=$(shasum -a 256 "$stage/$name.tar.gz" | awk '{print $1}')
printf '%s  %s.tar.gz\n' "$digest" "$name" > "$stage/checksum"
ln "$stage/$name.tar.gz" "$output"
if ! ln "$stage/checksum" "$output.sha256"; then
  if test "$output" -ef "$stage/$name.tar.gz"; then rm "$output"; fi
  exit 1
fi
printf '%s\n' "$output"
