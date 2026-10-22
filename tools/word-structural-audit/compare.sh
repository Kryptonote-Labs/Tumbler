#!/usr/bin/env bash
set -euo pipefail
# Dependency setup runs before acquiring the shared host lock. Invoke without an outer lock.
root=$(git rev-parse --show-toplevel)
output=${1:?Pass an output directory}
mkdir -p "$output"
output=$(realpath "$output")
baseline=$(mktemp -d /tmp/word-structural-baseline.XXXXXX)
trap 'rm -rf "$baseline"' EXIT
git archive 4d1465ddf85ee238a727dbed75aac7bf043f05f8 | tar -x -C "$baseline"
(cd "$baseline" && bun install --frozen-lockfile) > "$output/baseline-install.txt" 2>&1
mkdir -p "$baseline/tools/word-structural-audit"
cp "$root/tools/word-structural-audit/benchmark.ts" "$baseline/tools/word-structural-audit/benchmark.ts"
cp "$root"/packages/word/test/structural-*.ts "$baseline/packages/word/test/"
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 10m bash -c '
  baseline=$1 root=$2 output=$3
  (cd "$baseline" && bun test packages/word/test/structural-*.test.ts) > "$output/before-tests.txt" 2>&1 || true
  (cd "$baseline" && bun tools/word-structural-audit/benchmark.ts) > "$output/before.jsonl" || exit "$?"
  (cd "$root" && bun tools/word-structural-audit/benchmark.ts) > "$output/after.jsonl" || exit "$?"
  (cd "$root" && bun test packages/word/test/structural-*.test.ts) > "$output/after-tests.txt" 2>&1
' bash "$baseline" "$root" "$output"
