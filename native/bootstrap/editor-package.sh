#!/bin/sh
# Package the editor transport and declarative assets without a JS build tool.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(cat "$root/native/VERSION")
target_os=$(uname -s | tr '[:upper:]' '[:lower:]')
target_arch=$(uname -m)
case "$target_arch" in aarch64) target_arch=arm64;; x86_64) target_arch=x64;; esac
target_platform=$target_os-$target_arch
case "$version" in ''|*[!0-9A-Za-z.+-]*) printf '%s\n' 'Invalid native version' >&2; exit 1;; esac
mkdir -p "$root/.build/independent/share/editor"
stage=$(mktemp -d "$root/.build/native-editor.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
mkdir "$stage/extension"
cp -R "$root/editors/native-vscode/." "$stage/extension/"
mkdir "$stage/extension/native"
cp "$root/.build/independent/arya" "$stage/extension/native/arya"
cp -R "$root/.build/independent/lib" "$root/.build/independent/stdlib" "$stage/extension/native/"
cp "$root/native/THIRD-PARTY-NOTICES.txt" "$root/LICENSE" "$root/NOTICE" "$stage/extension/native/"
sed "s/\"version\": \"0.0.0\"/\"version\": \"$version\"/" "$root/editors/native-vscode/package.json" > "$stage/extension/package.json"
cat > "$stage/extension.vsixmanifest" <<XML
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="arya-language" Version="$version" Publisher="aryacode" TargetPlatform="$target_platform"/><DisplayName>Arya Language</DisplayName><Description xml:space="preserve">Native Arya language services and application tools.</Description><Tags>arya,native,language</Tags><Categories>Programming Languages</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.95.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/><Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/><Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>
</PackageManifest>
XML
cat > "$stage/[Content_Types].xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="arya" ContentType="text/plain"/></Types>
XML
(cd "$stage" && zip -qr package.vsix extension extension.vsixmanifest '[Content_Types].xml')
cp "$stage/package.vsix" "$root/.build/independent/share/editor/arya-language.vsix.new"
mv "$root/.build/independent/share/editor/arya-language.vsix.new" "$root/.build/independent/share/editor/arya-language.vsix"
printf '%s\n' "$root/.build/independent/share/editor/arya-language.vsix"
