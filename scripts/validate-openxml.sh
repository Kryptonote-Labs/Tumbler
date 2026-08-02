#!/usr/bin/env bash

set -euo pipefail

if ! command -v dotnet >/dev/null 2>&1; then
  printf 'dotnet is required for Open XML SDK validation.\n' >&2
  exit 1
fi
if (( $# == 0 )); then
  printf 'Pass at least one OOXML file to validate.\n' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_dir=$(cd -- "$script_dir/.." && pwd)

dotnet run --project "$project_dir/tools/openxml-validator/OpenXmlValidator.csproj" -- "$@"
