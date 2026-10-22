#!/bin/bash
# Run under the shared host lock; do not acquire another lock inside this script.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
output_dir=${1:?Pass an output directory}
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
baseline_ref=${2:-4d1465ddf85ee238a727dbed75aac7bf043f05f8}
baseline_dir=$(mktemp -d /tmp/chart-baseline.XXXXXX)
# Chart dependencies are unchanged by this PR; both versions use the installed lockfile dependencies.
git archive "$baseline_ref" packages/charts | tar -x -C "$baseline_dir"
mkdir -p "$baseline_dir/packages/charts/bench"
ln -s "$PWD/node_modules" "$baseline_dir/node_modules"
cp packages/charts/bench/render.ts "$baseline_dir/packages/charts/bench/render.ts"
bun "$baseline_dir/packages/charts/bench/render.ts" > "$output_dir/before.jsonl"
bun packages/charts/bench/render.ts > "$output_dir/after.jsonl"
# Getter counts run separately, outside timing samples.
bun packages/charts/bench/operations.ts "$baseline_dir" > "$output_dir/operations-before.jsonl"
bun packages/charts/bench/operations.ts "$PWD" > "$output_dir/operations-after.jsonl"
