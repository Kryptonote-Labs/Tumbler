#!/usr/bin/env bash
# Generate, schema-check and round-trip entrance fixtures through installed LibreOffice.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
artifacts=${1:-/tmp/tumbler-animation-verification}
mkdir -p "$artifacts/source" "$artifacts/libreoffice" "$artifacts/profile"
cd "$root"
bun scripts/generate-animation-fixtures.ts "$artifacts/source"
libreoffice "-env:UserInstallation=file://$artifacts/profile" --headless --convert-to 'pptx:Impress MS PowerPoint 2007 XML' --outdir "$artifacts/libreoffice" "$artifacts/source"/*.pptx
bun scripts/check-animation-roundtrip.ts "$artifacts/source" "$artifacts/libreoffice"
if [[ -n ${ECMA_PRESENTATION_SCHEMA_ARCHIVE:-} ]]; then
  python3 scripts/validate-presentation-schemas.py --schemas "$ECMA_PRESENTATION_SCHEMA_ARCHIVE" "$artifacts/source"/*.pptx
fi
