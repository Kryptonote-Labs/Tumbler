# Named style resolution cache

The cache reuses resolved declarations within one `WordStyles` instance. It is
bounded by the selected named styles plus one unstyled entry; missing references
share their default style's entry. Computed output is still produced per call.

The paired measurements in this directory compare `d255868` without the cache
against the cache added in this commit. Both versions include the corrected
style-toggle behavior. Both run the unchanged `scripts/benchmark-word-styles.ts`
from the original PR.

The generated workload resolves 256 leaf styles over an 80-deep chain, 10,000
calls per sample, with three warmups and nine measured samples. The median was
679.669 ms before caching and 8.763 ms after. Both checksums are 26,376,960.
This measures warm named-style reuse, not end-to-end document performance.

Both processes ran sequentially under one exclusive
`/tmp/tumbler-word-audit-heavy.lock` lease, with no tests running concurrently.
The host was Bun 1.4.4 on an Intel Celeron N5095 with four logical CPUs. The
advisory lock does not isolate unrelated host activity. Heap deltas are
GC-sensitive retained-heap observations, not total allocated bytes.

To reproduce, use a disposable checkout of each revision, retain the same
benchmark script on the baseline, and run `bun scripts/benchmark-word-styles.ts`.
Hold the same advisory lock across both runs. Raw timings and heap observations
are in `before-cache.json` and `after-cache.json`.
