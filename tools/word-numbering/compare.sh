#!/usr/bin/env bash
# Run from the repository root. Setup happens before acquiring the shared host lock.
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
timeout 2m bun install --frozen-lockfile > "$output/install.txt" 2>&1
# Bound execution, not time spent waiting for the shared host.
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 10m bash -s -- "$baseline" "$root" "$output" <<'RUN'
set -euo pipefail
baseline=$1
root=$2
output=$3
cd "$baseline"
if bun test packages/word/test/list-continuation.test.ts packages/word/test/numbering-budget.test.ts > "$output/before-tests.txt" 2>&1; then
  echo 'Expected baseline behavioral repro failures' >&2
  exit 1
fi
bun tools/word-numbering/benchmark.ts > "$output/before.jsonl"
cd "$root"
bun tools/word-numbering/benchmark.ts > "$output/after.jsonl"
bun test packages/word/test/list-continuation.test.ts packages/word/test/numbering-budget.test.ts > "$output/after-tests.txt" 2>&1
RUN
