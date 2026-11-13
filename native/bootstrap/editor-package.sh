#!/bin/sh
# Package the editor transport without a JS build tool or network access.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(cat "$root/native/VERSION")
mode=bundled
sdk=$root/.build/independent
output=
usage() { printf '%s\n' 'usage: editor-package.sh [--mode bundled|portable] [--sdk SDK_DIRECTORY] [--output OUTPUT.vsix]'; }
while test "$#" -gt 0; do
  case "$1" in
    --mode|--sdk|--output)
      test "$#" -ge 2 || { usage >&2; exit 2; }
      case "$1" in --mode) mode=$2;; --sdk) sdk=$2;; --output) output=$2;; esac
      shift 2;;
    --help) usage; exit 0;;
    *) usage >&2; exit 2;;
  esac
done
case "$mode" in bundled|portable) ;; *) usage >&2; exit 2;; esac
case "$version" in ''|*[!0-9A-Za-z.+-]*) printf '%s\n' 'Invalid native version' >&2; exit 1;; esac
case "$version" in *-*) prerelease=true;; *) prerelease=false;; esac
target_os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$target_os" in darwin|linux) ;; cygwin*|mingw*|msys*) target_os=win32;; *) printf '%s\n' "Unsupported editor host: $target_os" >&2; exit 1;; esac
target_arch=$(uname -m)
case "$target_arch" in aarch64|arm64) target_arch=arm64;; x86_64|amd64) target_arch=x64;; *) printf '%s\n' "Unsupported editor architecture: $target_arch" >&2; exit 1;; esac
target_platform=$target_os-$target_arch
executable=arya
if test "$target_os" = win32; then executable=arya.exe; fi
if test -z "$output"; then
  if test "$mode" = bundled; then output=$sdk/share/editor/arya-language.vsix
  else output=$root/.build/independent/share/editor/arya-language-portable.vsix; fi
fi
if test "$mode" = bundled; then
  test -x "$sdk/$executable" && test -d "$sdk/lib" && test -d "$sdk/stdlib" || { printf '%s\n' 'Bundled mode requires a complete native SDK for this host.' >&2; exit 1; }
  case "$("$sdk/$executable" --version)" in "Arya native $version "*) ;; *) printf '%s\n' 'SDK binary and editor source version differ; rebuild the SDK first.' >&2; exit 1;; esac
fi
mkdir -p "$(dirname -- "$output")"
stage=$(mktemp -d "$(dirname -- "$output")/.arya-editor.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
mkdir "$stage/extension"
cp -R "$root/editors/native-vscode/." "$stage/extension/"
rm -rf "$stage/extension/tests"
identity_target=
if test "$mode" = bundled; then
  identity_target=" TargetPlatform=\"$target_platform\""
  mkdir "$stage/extension/native"
  cp "$sdk/$executable" "$stage/extension/native/$executable"
  cp -R "$sdk/lib" "$sdk/stdlib" "$stage/extension/native/"
  for dependency in "$sdk"/*.dll; do
    test ! -f "$dependency" || cp "$dependency" "$stage/extension/native/"
  done
  cp "$root/native/THIRD-PARTY-NOTICES.txt" "$root/LICENSE" "$root/NOTICE" "$stage/extension/native/"
  printf '{"platform":"%s","arch":"%s","version":"%s"}\n' "$target_os" "$target_arch" "$version" > "$stage/extension/native/platform.json"
fi
sed -e "s/\"version\": \"0.0.0\"/\"version\": \"$version\"/" -e "s/\"preview\": true/\"preview\": $prerelease/" "$root/editors/native-vscode/package.json" > "$stage/extension/package.json"
cat > "$stage/extension.vsixmanifest" <<XML
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="arya-language" Version="$version" Publisher="aryacode"$identity_target/><DisplayName>Arya Language</DisplayName><Description xml:space="preserve">Native Arya language services and application tools.</Description><Tags>arya,native,language</Tags><Categories>Programming Languages</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.95.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/><Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/><Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="$prerelease"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>
</PackageManifest>
XML
cat > "$stage/[Content_Types].xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="arya" ContentType="text/plain"/></Types>
XML
(cd "$stage" && zip -qr package.vsix extension extension.vsixmanifest '[Content_Types].xml')
mv -f "$stage/package.vsix" "$output"
printf '%s\n' "$output"
