#!/bin/sh
# Install an extracted, checksum-verified SDK; retain older versions for rollback.
set -eu
usage() { printf '%s\n' 'usage: install-sdk.sh SDK_DIRECTORY [--prefix ABSOLUTE_DIRECTORY]' 'Default prefix: $HOME/.local. Installs prefix/bin/arya and prefix/lib/arya/VERSION-OS-ARCH.'; }
test "$#" -ge 1 || { usage >&2; exit 2; }
case "$1" in --help|-h) usage; exit 0;; esac
sdk=$1
shift
prefix=${HOME:?HOME is required unless invoking from an environment with HOME set}/.local
while test "$#" -gt 0; do
  case "$1" in --prefix) test "$#" -ge 2 || { usage >&2; exit 2; }; prefix=$2; shift 2;; *) usage >&2; exit 2;; esac
done
case "$prefix" in /*) ;; *) printf '%s\n' 'Installation prefix must be absolute.' >&2; exit 2;; esac
sdk=$(CDPATH= cd -- "$sdk" && pwd)
os=$(uname -s | tr '[:upper:]' '[:lower:]')
executable=arya
case "$os" in darwin|linux) ;; cygwin*) os=windows-cygwin; executable=arya.exe;; *) printf '%s\n' 'Use macOS, Linux, or a Cygwin shell on Windows for this installer.' >&2; exit 1;; esac

for file in VERSION SHA256SUMS "$executable"; do test -f "$sdk/$file" || { printf '%s\n' "Missing SDK file: $file" >&2; exit 1; }; done
test -d "$sdk/lib" && test -d "$sdk/stdlib" || { printf '%s\n' 'SDK lib/ and stdlib/ are required.' >&2; exit 1; }
version=$(cat "$sdk/VERSION")
case "$version" in ''|*[!0-9A-Za-z.+-]*) printf '%s\n' 'Invalid SDK version.' >&2; exit 1;; esac
arch=$(uname -m)
case "$arch" in aarch64) arch=arm64;; x86_64) arch=x64;; esac
if command -v shasum >/dev/null 2>&1; then checksum=shasum
elif command -v sha256sum >/dev/null 2>&1; then checksum=sha256sum
else printf '%s\n' 'Install shasum or sha256sum to verify the SDK.' >&2; exit 1; fi
verify() {
  folder=$1
  test -z "$(find "$folder" -type l -print)" || { printf '%s\n' 'SDK symlinks are not accepted.' >&2; return 1; }
  awk 'length(substr($0,1,64))!=64 || substr($0,1,64) ~ /[^0-9a-f]/ || substr($0,65,4)!="  ./" || substr($0,67) ~ /(^|\/)\.\.(\/|$)|\\/ || seen[substr($0,67)]++ { exit 1 } END { if(NR==0) exit 1 }' "$folder/SHA256SUMS" || { printf '%s\n' 'Invalid SDK checksum manifest.' >&2; return 1; }
  (cd "$folder" && if test "$checksum" = shasum; then shasum -a 256 -c SHA256SUMS >/dev/null; else sha256sum -c SHA256SUMS >/dev/null; fi) || return 1
  (cd "$folder" && find . -type f ! -path './SHA256SUMS' -print | LC_ALL=C sort) > "$stage/actual-files"
  awk '{print substr($0,67)}' "$folder/SHA256SUMS" | LC_ALL=C sort > "$stage/listed-files"
  cmp -s "$stage/actual-files" "$stage/listed-files" || { printf '%s\n' 'SDK checksum manifest does not cover exactly the SDK files.' >&2; return 1; }
}
mkdir -p "$prefix"
prefix=$(CDPATH= cd -- "$prefix" && pwd)
lock=$prefix/.arya-install.lock
mkdir "$lock" 2>/dev/null || { printf '%s\n' "Another installation may be running: $lock" >&2; exit 1; }
stage=
trap 'test -z "$stage" || rm -rf "$stage"; rmdir "$lock"' EXIT HUP INT TERM
stage=$(mktemp -d "$prefix/.arya-install.XXXXXX")
verify "$sdk"
mkdir -p "$prefix/lib/arya" "$prefix/bin"
target=$prefix/lib/arya/$version-$os-$arch
native_editor_path=
if test "$os" = windows-cygwin; then native_editor_path=$(cygpath -w "$target/$executable"); fi
launcher=$prefix/bin/arya
if test -e "$target" || test -L "$target"; then printf '%s\n' "SDK version is already installed: $target" >&2; exit 1; fi
if test -L "$launcher"; then
  case "$(readlink "$launcher")" in "$prefix/lib/arya/"*/arya|"$prefix/lib/arya/"*/arya.exe) ;; *) printf '%s\n' "Refusing to replace an unmanaged launcher: $launcher" >&2; exit 1;; esac
elif test -e "$launcher"; then printf '%s\n' "Refusing to replace an existing file: $launcher" >&2; exit 1; fi
cp -R "$sdk" "$stage/sdk"
verify "$stage/sdk"
case "$("$stage/sdk/$executable" --version)" in "Arya native $version "*) ;; *) printf '%s\n' 'SDK executable failed its version check on this host.' >&2; exit 1;; esac
mv "$stage/sdk" "$target"
ln -s "$target/$executable" "$stage/arya"
if ! mv -f "$stage/arya" "$launcher"; then
  printf '%s\n' "SDK installed at $target but launcher update failed. Existing command was preserved." >&2
  exit 1
fi
printf 'Installed Arya %s at %s\n' "$version" "$target"
printf 'Run: "%s" --version\nAdd %s to PATH if needed.\n' "$launcher" "$prefix/bin"
if test "$os" = windows-cygwin; then
  printf 'Native Windows editor compiler: %s\n' "$native_editor_path"
  printf '%s\n' 'Keep the matching Cygwin bin directory on the native Windows PATH for runtime DLLs.'
fi
