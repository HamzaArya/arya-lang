#!/bin/sh
# Assemble the installed layout without publishing a release archive.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
test "$#" -eq 1 || { printf '%s\n' 'usage: stage-sdk.sh empty-destination' >&2; exit 2; }
destination=$1
test ! -e "$destination" && test ! -L "$destination" || { printf '%s\n' "SDK destination exists: $destination" >&2; exit 1; }
mkdir -p "$destination/docs"
cp "$root/.build/independent/arya" "$destination/arya"
cp -R "$root/.build/independent/lib" "$root/.build/independent/stdlib" "$destination/"
if test -d "$root/.build/independent/share"; then cp -R "$root/.build/independent/share" "$destination/"; fi
cp "$root/LICENSE" "$root/NOTICE" "$root/native/THIRD-PARTY-NOTICES.txt" "$root/native/manifest.json" "$root/native/PROVENANCE.json" "$destination/"
cp "$root/native/VERSION" "$destination/VERSION"
if test -d "$root/native/qualification"; then cp -R "$root/native/qualification" "$destination/qualification"; fi
cp "$root/native/tests/fixtures/decimal.arya" "$root/native/examples/calculation-worker.arya" "$destination/"
cp "$root/docs/native-sdk.md" "$destination/docs/README.md"
cp "$root/docs/native-profile.md" "$root/docs/accounting-engine.md" "$destination/docs/"
cp "$root/docs/native-finance-data.md" "$root/docs/native-data-performance.md" "$destination/docs/"
cp "$root/native/examples/stream-ledger.arya" "$destination/"
cat > "$destination/README.txt" <<'TEXT'
Arya native SDK

Run ./arya --version, then ./arya create my-app --template cli.
Run ./arya build decimal.arya -o ./example and execute ./example directly.
Keep lib/ and stdlib/ beside arya. A C11 toolchain builds applications.
Node/npm are not required. Python is used only by explicit Python bridges;
MySQL applications need a separately installed native MySQL C client SDK.
The optional macOS desktop host uses the system AppKit/WebKit renderer.
Editor installation: ./arya editor install --editor code
Read docs/README.md and manifest.json for the native profile and limits.
TEXT
(cd "$destination" && find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort | while IFS= read -r filename; do shasum -a 256 "$filename"; done > SHA256SUMS)
