#!/usr/bin/env bash
# Run from the repository root, holding the shared host lock across both versions.
set -euo pipefail
output=${1:?Pass an absolute output directory}
case "$output" in /*) ;; *) echo 'Output directory must be absolute' >&2; exit 1;; esac
baseline=$(mktemp -d)
trap 'rm -rf "$baseline"' EXIT
root=$PWD
mkdir -p "$output"
git archive 4d1465ddf85ee238a727dbed75aac7bf043f05f8 | tar -x -C "$baseline"
mkdir -p "$baseline/tools/word-numbering"
cp tools/word-numbering/benchmark.ts "$baseline/tools/word-numbering/benchmark.ts"
cp packages/word/test/list-continuation.test.ts packages/word/test/numbering-budget.test.ts "$baseline/packages/word/test/"
cd "$baseline"
bun install --frozen-lockfile > "$output/install.txt" 2>&1
if bun test packages/word/test/list-continuation.test.ts packages/word/test/numbering-budget.test.ts > "$output/before-tests.txt" 2>&1; then
  echo 'Expected baseline behavioral repro failures' >&2
  exit 1
fi
bun tools/word-numbering/benchmark.ts > "$output/before.jsonl"
cd "$root"
bun tools/word-numbering/benchmark.ts > "$output/after.jsonl"
bun test packages/word/test/list-continuation.test.ts packages/word/test/numbering-budget.test.ts > "$output/after-tests.txt" 2>&1
