#!/usr/bin/env bash
set -euo pipefail
output=${1:?Usage: bash scripts/fetch-inkml-schemas.sh OUTPUT_DIRECTORY}
mkdir -p "$output"
base=https://www.w3.org/TR/2011/REC-InkML-20110920
curl --retry 3 -fsSL "$base/inkml.xsd" -o "$output/inkml.xsd"
curl --retry 3 -fsSL "$base/inkml-mathml2-subset.xsd" -o "$output/inkml-mathml2-subset.xsd"
curl --retry 3 -fsSL https://www.w3.org/2001/xml.xsd -o "$output/xml.xsd"
cd "$output"
sha256sum --check <<'HASHES'
e8c28da9ab68fa329900fe93e34722da4f59328698cab071f0e32345b8a15c1d  inkml.xsd
f7d7f1a95258cb180e00f3127c4d2eb31ae9c518442ff3c9bb61d8ed27e31497  inkml-mathml2-subset.xsd
61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c  xml.xsd
HASHES
