#!/bin/sh
# Fresh source proof with Node and Python absent from the executable search path.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
mkdir -p "$root/.build"
workspace=$(mktemp -d "${TMPDIR:-/tmp}/arya-native-clean.XXXXXX")
printf 'Native clean workspace: %s\n' "$workspace"
mkdir "$workspace/source" "$workspace/tools" "$workspace/source/native"
for item in compiler runtime bootstrap vendor tests examples libraries python desktop; do cp -R "$root/native/$item" "$workspace/source/native/$item"; done
for item in VERSION manifest.json PROVENANCE.json THIRD-PARTY-NOTICES.txt; do cp "$root/native/$item" "$workspace/source/native/$item"; done
if test -d "$root/native/qualification"; then cp -R "$root/native/qualification" "$workspace/source/native/qualification"; fi
cp "$root/Makefile" "$root/LICENSE" "$root/NOTICE" "$workspace/source/"
cp -R "$root/bin" "$workspace/source/bin"
mkdir "$workspace/source/editors"
cp -R "$root/editors/native-vscode" "$workspace/source/editors/"
mkdir "$workspace/source/docs"
cp "$root/docs/native-sdk.md" "$workspace/source/docs/"
cp "$root/docs/native-profile.md" "$root/docs/accounting-engine.md" "$workspace/source/docs/"
cp "$root/docs/native-finance-data.md" "$root/docs/native-data-performance.md" "$workspace/source/docs/"
for directory in /bin /usr/bin; do
  for tool in "$directory"/*; do
    test -f "$tool" && test -x "$tool" || continue
    name=${tool##*/}
    case "$name" in node*|npm*|npx*|python*|pypy*|bun*|deno*|qjs*|jsc*|js) continue;; esac
    test ! -e "$workspace/tools/$name" || continue
    ln -s "$tool" "$workspace/tools/$name"
  done
done
if env -i PATH="$workspace/tools" /bin/sh -c 'command -v node || command -v python || command -v python3'; then exit 1; fi
cd "$workspace/source"
env -i PATH="$workspace/tools" CC=/usr/bin/cc "$workspace/tools/make" native-editor native-test native-profile-test > "$workspace/verification.log" 2>&1
cmp .build/independent/stage2.c .build/independent/arya.c
env -i PATH="$workspace/tools" native/bootstrap/package.sh > "$workspace/package.log" 2>&1
mkdir "$workspace/installed SDK's location"
archive=$(find artifacts -name 'arya-native-*.tar.gz' -print)
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
test -f "$sdk/share/editor/arya-language.vsix"
if command -v otool >/dev/null 2>&1; then otool -L "$sdk/arya" "$sdk/services" > "$workspace/dependencies.txt"; else ldd "$sdk/arya" "$sdk/services" > "$workspace/dependencies.txt"; fi
if grep -Ei 'libnode|libpython|libv8|quickjs|javascriptcore' "$workspace/dependencies.txt"; then exit 1; fi
printf '%s\n' "$workspace" > "$root/.build/native-clean-location.txt"
printf '%s\n' "Independent source build and tests passed without Node/Python: $workspace"
