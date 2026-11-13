#!/bin/sh
# Fresh source proof with Node and Python absent from the executable search path.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
mkdir -p "$root/.build"
workspace=$(mktemp -d "${TMPDIR:-/tmp}/arya-native-clean.XXXXXX")
printf 'Native clean workspace: %s\n' "$workspace"
printf '%s\n' "$workspace" > "$root/.build/native-clean-location.txt"
mkdir "$workspace/source" "$workspace/tools" "$workspace/source/native"
for item in compiler runtime bootstrap vendor tests libraries python desktop gui; do cp -R "$root/native/$item" "$workspace/source/native/$item"; done
for item in VERSION manifest.json PROVENANCE.json THIRD-PARTY-NOTICES.txt; do cp "$root/native/$item" "$workspace/source/native/$item"; done
if test -d "$root/native/qualification"; then cp -R "$root/native/qualification" "$workspace/source/native/qualification"; fi
cp "$root/Makefile" "$root/LICENSE" "$root/NOTICE" "$workspace/source/"
cp -R "$root/bin" "$workspace/source/bin"
sh "$root/native/bootstrap/copy-documentation.sh" source "$root" "$workspace/source"
for directory in /bin /usr/bin; do
  for tool in "$directory"/*; do
    test -f "$tool" && test -x "$tool" || continue
    name=${tool##*/}
    case "$name" in node*|npm*|npx*|python*|pypy*|bun*|deno*|qjs*|jsc*|js) continue;; esac
    test ! -e "$workspace/tools/$name" || continue
    ln -s "$tool" "$workspace/tools/$name"
  done
done
env -i PATH="$workspace/tools" /bin/sh -c 'for engine in node nodejs npm npx python python3 bun deno qjs jsc js; do if command -v "$engine" >/dev/null 2>&1; then exit 1; fi; done; exit 0'
cd "$workspace/source"
if ! env -i PATH="$workspace/tools" CC=/usr/bin/cc "$workspace/tools/make" native-sdk native-test native-profile-test native-distribution-test > "$workspace/verification.log" 2>&1; then
  tail -n 160 "$workspace/verification.log" >&2
  printf 'Full fresh-source log: %s\n' "$workspace/verification.log" >&2
  exit 1
fi
cmp .build/independent/stage2.c .build/independent/arya.c
env -i PATH="$workspace/tools" native/bootstrap/package.sh > "$workspace/package.log" 2>&1
mkdir "$workspace/installed SDK's location"
archive=$(find artifacts -name 'arya-native-*.tar.gz' -print)
tar -tzf "$archive" > "$workspace/archive-contents.txt"
if grep -E '(^|/)\._' "$workspace/archive-contents.txt"; then printf '%s\n' 'SDK archive contains AppleDouble metadata.' >&2; exit 1; fi
tar -xzf "$archive" -C "$workspace/installed SDK's location"
sdk=$(find "$workspace/installed SDK's location" -mindepth 1 -maxdepth 1 -type d -print)
(cd "$sdk" && shasum -a 256 -c SHA256SUMS) > "$workspace/sdk-integrity.log"
ln -s "$sdk/arya" "$workspace/arya-link"
env -i PATH="$workspace/tools" "$sdk/arya" build "$sdk/decimal.arya" -o "$sdk/application" --release > "$workspace/install.log" 2>&1
env -i PATH=/nonexistent "$sdk/application" > "$workspace/installed-output.txt"
diff native/tests/fixtures/decimal.expected "$workspace/installed-output.txt"
env -i PATH="$workspace/tools" "$workspace/arya-link" build native/tests/fixtures/sdk.arya -o "$sdk/services" --debug >> "$workspace/install.log" 2>&1
env -i PATH=/nonexistent "$sdk/services" > "$workspace/installed-services.txt"
env -i PATH=/nonexistent "$sdk/arya" editor status --json > "$workspace/installed-editor.json"
test ! -e "$sdk/share/editor/arya-language.vsix"
if command -v otool >/dev/null 2>&1; then otool -L "$sdk/arya" "$sdk/services" > "$workspace/dependencies.txt"; else ldd "$sdk/arya" "$sdk/services" > "$workspace/dependencies.txt"; fi
if grep -Ei 'libnode|libpython|libv8|quickjs|javascriptcore' "$workspace/dependencies.txt"; then exit 1; fi
printf '%s\n' "$workspace" > "$root/.build/native-clean-location.txt"
printf '%s\n' "Independent source build and tests passed without Node/Python: $workspace"
