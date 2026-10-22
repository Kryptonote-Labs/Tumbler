#!/usr/bin/env bash
# Run under the shared audit lock; this script deliberately does not acquire a nested lock.
set -euo pipefail
cd "$(dirname "$0")/.."
output="${1:-/tmp/tumbler-ink-benchmark}"
mkdir -p "$output"
output="$(realpath "$output")"
baseline="packages/svelte/src/WordInkPageLayer.audit.svelte"
trap 'rm -f "$baseline"' EXIT
git show 4d1465ddf85ee238a727dbed75aac7bf043f05f8:packages/svelte/src/WordInkPageLayer.svelte > "$baseline"
{
  uname -a
  bun --version
  lscpu
  cat /proc/loadavg
} > "$output/runtime.txt"
VITE_INK_BASELINE="/@fs$(pwd)/apps/docs/node_modules/@tumblerjs/svelte/src/WordInkPageLayer.audit.svelte" \
  INK_BENCHMARK="$output/before.json" timeout 5m bun run --cwd apps/docs test:e2e --config playwright.ink.config.ts -g 'ink allocation benchmark' > "$output/before.log" 2>&1
INK_BENCHMARK="$output/after.json" timeout 5m bun run --cwd apps/docs test:e2e --config playwright.ink.config.ts -g 'ink allocation benchmark' > "$output/after.log" 2>&1
cat /proc/loadavg >> "$output/runtime.txt"
