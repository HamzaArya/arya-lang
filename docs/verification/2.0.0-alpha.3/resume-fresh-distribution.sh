#!/bin/sh
set -eu
root=/Users/hamza/Projects/github-repo/arya-lang
workspace=/var/folders/x3/tv0cqqj13wsfm2jgyl3b5lv00000gn/T/arya-native-clean.t6ugj0
cd "$workspace/source"
env -i PATH="$workspace/tools" CC=/usr/bin/cc "$workspace/tools/make" native-distribution-test > "$workspace/distribution-resumed.log" 2>&1
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
