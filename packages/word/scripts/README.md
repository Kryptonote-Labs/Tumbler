Run the deterministic multi-client stress test with:

```sh
RUNS=1000 SEED=20261028 bun packages/word/scripts/stress-collaboration.ts
```

Each sequence uses three clients and a mirrored network using standard Yjs writes. It varies
garbage collection, formatting, Unicode, batches, undo/redo, reentrant observers and delayed,
out-of-order, duplicate packet delivery. After every action it compares exact wire state,
incremental text, paragraph projection and full/incremental snapshots. Final packet draining checks
semantic convergence. A failure reports its seed, path, sequence and assertion so it can be reduced
to a focused regression test. This is a correctness stress test, not a latency benchmark.
