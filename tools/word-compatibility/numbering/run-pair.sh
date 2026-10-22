#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
base=${1:-db5cf0b}
output=${2:?provide an output directory}
benchmark=${3:-benchmark.ts}
case "$benchmark" in benchmark.ts|stories-benchmark.ts) ;; *) exit 2 ;; esac
mkdir -p "$output"
output=$(realpath "$output")
baseline=$(mktemp -d /tmp/tumbler-numbering-baseline.XXXXXX)
trap 'rm -rf "$baseline"' EXIT
git -C "$root" archive "$base" | tar -x -C "$baseline"
mkdir -p "$baseline/tools/word-compatibility/numbering"
cp "$root/tools/word-compatibility/numbering/$benchmark" "$baseline/tools/word-compatibility/numbering/$benchmark"
if [ "$benchmark" = stories-benchmark.ts ]; then
  cp "$root/packages/word/test/numbering-story-fixture.ts" "$baseline/packages/word/test/numbering-story-fixture.ts"
fi
bun install --frozen-lockfile --cwd "$baseline"
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 10m bash -e -c '
  bun "$1/tools/word-compatibility/numbering/$4" > "$3/before.json"
  bun "$2/tools/word-compatibility/numbering/$4" > "$3/after.json"
' bash "$baseline" "$root" "$output" "$benchmark"
