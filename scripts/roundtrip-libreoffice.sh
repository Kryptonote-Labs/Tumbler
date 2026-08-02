#!/usr/bin/env bash

set -euo pipefail

if ! command -v libreoffice >/dev/null 2>&1; then
  printf 'LibreOffice is required for spreadsheet round-trip validation.\n' >&2
  exit 1
fi
if ! python3 -c 'import uno' >/dev/null 2>&1; then
  printf 'LibreOffice Python UNO bindings are required for spreadsheet round-trip validation.\n' >&2
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
libreoffice_pid=""
cleanup() {
  if [[ -n "$libreoffice_pid" ]]; then kill "$libreoffice_pid" >/dev/null 2>&1 || true; fi
  rm -rf -- "$profile_dir"
}
trap cleanup EXIT

shopt -s nullglob
inputs=("$input_dir"/*.xlsx)
if (( ${#inputs[@]} == 0 )); then
  printf 'No XLSX fixtures found in %s.\n' "$input_dir" >&2
  exit 1
fi

libreoffice \
  "-env:UserInstallation=file://$profile_dir" \
  --headless \
  --norestore \
  --nodefault \
  --nofirststartwizard \
  '--accept=socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext' \
  >/dev/null 2>&1 &
libreoffice_pid=$!

python3 "$script_dir/roundtrip-libreoffice.py" "$input_dir" "$output_dir"

bun "$script_dir/check-spreadsheet-roundtrip.ts" "$output_dir"
