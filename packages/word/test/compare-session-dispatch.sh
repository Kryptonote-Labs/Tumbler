#!/usr/bin/env bash
# Run from the repo root under the shared heavy-work lock.
set -euo pipefail
output=${1:-/tmp/word-session-dispatch-benchmark}
mkdir -p "$output"
baseline=$(mktemp "$PWD/packages/word/src/session-baseline-XXXXXX.ts")
trap 'rm -f "$baseline"' EXIT
git show 4d1465ddf85ee238a727dbed75aac7bf043f05f8:packages/word/src/session.ts > "$baseline"
WORD_SESSION_MODULE="$baseline" timeout 2m bun packages/word/test/session-dispatch.bench.ts > "$output/before.json"
timeout 2m bun packages/word/test/session-dispatch.bench.ts > "$output/after.json"
cat "$output/before.json" "$output/after.json"
