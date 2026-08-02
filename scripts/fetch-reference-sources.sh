#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_dir=$(cd -- "$script_dir/.." && pwd)
vendor_dir="$project_dir/docs/reference/vendor"
download_dir="$vendor_dir/downloads"
raw_dir="$vendor_dir/raw"
markdown_dir="$vendor_dir/markdown"

mkdir -p "$download_dir" "$raw_dir/ecma" "$raw_dir/microsoft" \
  "$markdown_dir/ecma" "$markdown_dir/microsoft"

download() {
  local url=$1
  local output=$2

  if [[ -s "$output" ]]; then
    printf 'Using %s\n' "${output#$project_dir/}"
    return
  fi

  printf 'Downloading %s\n' "$url"
  curl --fail --location --retry 3 --output "$output" "$url"
}

download \
  'https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip' \
  "$download_dir/ecma-376-part-1.zip"
download \
  'https://ecma-international.org/wp-content/uploads/ECMA-376-2_5th_edition_december_2021.zip' \
  "$download_dir/ecma-376-part-2.zip"
download \
  'https://ecma-international.org/wp-content/uploads/ECMA-376-3_5th_edition_december_2015.zip' \
  "$download_dir/ecma-376-part-3.zip"
download \
  'https://ecma-international.org/wp-content/uploads/ECMA-376-4_5th_edition_december_2016.zip' \
  "$download_dir/ecma-376-part-4.zip"
download \
  'https://officeprotocoldocs-f5hpbjgea6b8gneq.b02.azurefd.net/files/MSOFFSTAND.zip' \
  "$download_dir/microsoft-office-standards-support.zip"

for archive in "$download_dir"/ecma-376-part-*.zip; do
  unzip -oq "$archive" -d "$raw_dir/ecma"
done
unzip -oq "$download_dir/microsoft-office-standards-support.zip" \
  -d "$raw_dir/microsoft"

if ! command -v pdftotext >/dev/null 2>&1; then
  printf 'pdftotext is required to build the searchable Markdown copies.\n' >&2
  exit 1
fi

convert_pdf() {
  local pdf=$1
  local output_dir=$2
  local relative_source=$3
  local stem
  local output

  stem=$(basename -- "${pdf%.pdf}")
  output="$output_dir/$stem.md"

  {
    printf '# %s\n\n' "$stem"
    printf '> Local text extraction for engineering search. '
    printf 'The original document and its copyright terms remain authoritative.\n\n'
    printf -- '- Source file: `%s`\n' "$relative_source"
    printf -- '- Generated: `%s`\n\n' "$(date -u +%Y-%m-%d)"
    printf '%s\n\n' '---'
    pdftotext -layout "$pdf" -
  } > "$output"
}

while IFS= read -r -d '' pdf; do
  convert_pdf "$pdf" "$markdown_dir/ecma" \
    "${pdf#$project_dir/}"
done < <(find "$raw_dir/ecma" -type f -name '*.pdf' -print0)

# These specifications cover OOXML implementation behavior and extensions. The
# Microsoft bundle also contains ODF material, which is retained as a raw source
# but not converted into our searchable OOXML set.
microsoft_specs=(
  MS-CUSTOMUI
  MS-CUSTOMUI2
  MS-DOCX
  MS-ODRAWXML
  MS-OE376
  MS-OEXTXML
  MS-OFFMACRO
  MS-OFFMACRO2
  MS-OI29500
  MS-OINTXML
  MS-OREACTXML
  MS-OTASKXML
  MS-OWEXML
  MS-PPTX
  MS-XLSX
)

for spec in "${microsoft_specs[@]}"; do
  while IFS= read -r -d '' pdf; do
    convert_pdf "$pdf" "$markdown_dir/microsoft" \
      "${pdf#$project_dir/}"
  done < <(find "$raw_dir/microsoft" -type f \
    -iname "\\[${spec}\\].pdf" -print0)
done

(
  cd -- "$vendor_dir"
  find downloads raw -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum > source-manifest.sha256
)

printf '\nReference archive ready at %s\n' "$vendor_dir"
printf 'Converted Markdown files: '
find "$markdown_dir" -type f -name '*.md' | wc -l
