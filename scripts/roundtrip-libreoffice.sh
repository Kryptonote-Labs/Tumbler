#!/usr/bin/env bash

set -euo pipefail

if ! command -v libreoffice >/dev/null 2>&1; then
  printf 'LibreOffice is required for spreadsheet round-trip validation.\n' >&2
  exit 1
fi
if (( $# != 2 )); then
  printf 'Usage: %s INPUT_DIRECTORY OUTPUT_DIRECTORY\n' "$0" >&2
  exit 1
fi

input_dir=$(cd -- "$1" && pwd)
mkdir -p "$2"
output_dir=$(cd -- "$2" && pwd)
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
profile_dir=$(mktemp -d)
trap 'rm -rf -- "$profile_dir"' EXIT

shopt -s nullglob
inputs=("$input_dir"/*.xlsx)
if (( ${#inputs[@]} == 0 )); then
  printf 'No XLSX fixtures found in %s.\n' "$input_dir" >&2
  exit 1
fi

for input in "${inputs[@]}"; do
  libreoffice \
    "-env:UserInstallation=file://$profile_dir" \
    --headless \
    --convert-to xlsx \
    --outdir "$output_dir" \
    "$input" >/dev/null
done

bun "$script_dir/check-spreadsheet-roundtrip.ts" "$output_dir"
