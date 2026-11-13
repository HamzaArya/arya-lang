#!/bin/sh
# Shared source/SDK documentation assembly. Requires only POSIX shell utilities.
set -eu
test "$#" -eq 3 || { printf '%s\n' 'usage: copy-documentation.sh source|source-package|sdk source-root destination-root' >&2; exit 2; }
mode=$1
case "$mode" in source|source-package|sdk) ;; *) printf '%s\n' "Unknown documentation mode: $mode" >&2; exit 2;; esac
source_root=$(CDPATH= cd -- "$2" && pwd)
mkdir -p "$3"
destination_root=$(CDPATH= cd -- "$3" && pwd)
test "$source_root" != "$destination_root" || { printf '%s\n' 'Documentation assembly requires a separate destination.' >&2; exit 1; }
catalog="$source_root/native/DOCUMENTATION"
test -f "$catalog" || { printf '%s\n' "Missing documentation catalog: $catalog" >&2; exit 1; }

fail() { printf '%s\n' "$*" >&2; exit 1; }
validate_path() {
  case "$1" in ''|/*|../*|*/../*|*/..|..|./*|*/./*|*/.|*'|'*) fail "Invalid documentation catalog path: $1";; esac
}
copy_file() {
  input=$1
  output=$2
  test -f "$source_root/$input" && test ! -L "$source_root/$input" || fail "Missing regular documentation input: $input"
  case "$input" in *.js|*.cjs|*.mjs|*.vsix) fail "Editor/JavaScript tooling is excluded from native documentation: $input";; esac
  mkdir -p "$destination_root/$(dirname -- "$output")"
  cp "$source_root/$input" "$destination_root/$output"
}

while IFS='|' read -r kind source_path sdk_path extra; do
  case "$kind" in ''|'#'*) continue;; esac
  test -z "$extra" || fail "Invalid documentation catalog row: $kind|$source_path|$sdk_path|$extra"
  validate_path "$source_path"
  validate_path "$sdk_path"
  output_path=$source_path
  if test "$mode" = sdk; then output_path=$sdk_path; fi
  case "$kind" in
    file) copy_file "$source_path" "$output_path";;
    tree)
      test -d "$source_root/$source_path" && test ! -L "$source_root/$source_path" || fail "Missing documentation directory: $source_path"
      links=$(find "$source_root/$source_path" -type l -print)
      test -z "$links" || fail "Documentation trees must not contain symlinks: $source_path"
      mkdir -p "$destination_root/$output_path"
      find "$source_root/$source_path" -type f ! -name '.DS_Store' ! -name '._*' -print | LC_ALL=C sort | while IFS= read -r filename; do
        relative=${filename#"$source_root/$source_path/"}
        copy_file "$source_path/$relative" "$output_path/$relative"
      done
      ;;
    *) fail "Unknown documentation catalog entry: $kind";;
  esac
done < "$catalog"

if test "$mode" != sdk; then
  mkdir -p "$destination_root/native"
  cp "$catalog" "$destination_root/native/DOCUMENTATION"
fi
if test "$mode" != source; then
  # Repository documents keep their original bytes. Only the assembled package's
  # Markdown is rewritten to its own layout; unshipped sources are labeled.
  find "$destination_root/docs" -type f -name '*.md' -print > "$destination_root/.documentation-markdown"
  printf '%s\n' "$destination_root/CONTRIBUTING.md" >> "$destination_root/.documentation-markdown"
  while IFS= read -r filename; do
    relative=${filename#"$destination_root/"}
    awk -v catalog="$catalog" -v document="$relative" -v layout="$mode" -f "$source_root/native/bootstrap/sdk-doc-links.awk" "$filename" > "$filename.relinked"
    mv "$filename.relinked" "$filename"
  done < "$destination_root/.documentation-markdown"
  rm "$destination_root/.documentation-markdown"
fi
