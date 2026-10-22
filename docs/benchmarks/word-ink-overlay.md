# Word ink overlay audit measurements

Measured on 2026-10-22 using Chrome 156.0.8078.47, Bun 1.4.4, Linux x86-64,
and one Intel Celeron N5095 with four logical CPUs and 16 GB RAM. Before and after
used the same browser/runtime, generated fixture, host, instrumentation and method.
The entire pair held `/tmp/tumbler-word-audit-heavy.lock`. Other host activity
remained; one-minute system load was 3.43 before and 4.44 afterward. These are
observations on a shared host, not stable throughput guarantees. Raw samples are
in [before.json](word-ink-overlay/before.json) and [after.json](word-ink-overlay/after.json).

The fixture is a generated A4 page, 595.28×841.89 points, with a 20×20-point XOR
ink mark at 100×100 points. Each condition mounts either one or four actual Svelte
ink layers, uses two warmups and five measured samples, and disposes the layers
between samples. Timing starts before mounting and ends when every overlay has
finished, including its asynchronous yields. No tests ran concurrently with this
benchmark. This measures overlay composition, not document import, full editor
layout, source-image decoding or a desktop Word rendering run.

The baseline component is copied verbatim from audit commit
`4d1465ddf85ee238a727dbed75aac7bf043f05f8`. The fixed component and measurement
method are from `38b52e1905a312c6f8df2c7e6c0feb08aad869af`. Both use the same page
painter; its uncropped path is unchanged for this fixture. An earlier pair emitted
a Vite stylesheet-loading error for the copied baseline and was discarded. The
reported pair uses a normal source path and passed without that setup error.

## Elapsed time and retained pixels

Times are medians of five samples, in milliseconds. Raw timings include the host
noise rather than selecting the fastest samples.

| Zoom | DPR | Pages | Before ms | After ms | Before retained pixels | After retained pixels |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 100% | 1 | 1 | 73.9 | 17.6 | 891,662 | 841 |
| 100% | 1 | 4 | 179.8 | 20.9 | 3,566,648 | 3,364 |
| 300% | 1 | 1 | 404.8 | 27.6 | 8,022,576 | 7,396 |
| 300% | 1 | 4 | 1443.8 | 90.6 | 32,090,304 | 29,584 |
| 100% | 2 | 1 | 188.9 | 17.8 | 3,566,648 | 3,364 |
| 100% | 2 | 4 | 631.8 | 59.2 | 14,266,592 | 13,456 |
| 300% | 2 | 1 | 1470.2 | 33.2 | 32,083,568 | 7,396 |
| 300% | 2 | 4 | 5733.0 | 90.1 | 128,334,272 | 29,584 |

## Allocations and work

Instrumentation counts canvas pixel allocation requests after a 2D context exists,
actual `getImageData` byte lengths, and explicit raster result/coverage typed-array
allocations. Resizes are counted as allocation requests even if the browser reuses
storage. Canvas tracking uses weak references rather than retaining discarded
buffers. The canvas peak records observed backing capacity at API calls. The
ImageData peak below is the two simultaneous comparison buffers. Their sum is a
conservative live-buffer upper bound, not sampled process RSS or a GC-exact heap
measurement. Decoder memory, scene objects, GPU copies and browser internals are
outside these counters; the raw data also records the raster typed-array bytes.

| Zoom | DPR | Pages | Before canvas peak bytes | After canvas peak bytes | Before paired ImageData bytes | After paired ImageData bytes |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 100% | 1 | 1 | 10,699,944 | 10,092 | 7,133,296 | 6,728 |
| 100% | 1 | 4 | 42,799,776 | 20,184 | 7,133,296 | 6,728 |
| 300% | 1 | 1 | 96,270,912 | 88,752 | 64,180,608 | 59,168 |
| 300% | 1 | 4 | 385,083,648 | 177,504 | 64,180,608 | 59,168 |
| 100% | 2 | 1 | 42,799,776 | 40,368 | 28,533,184 | 26,912 |
| 100% | 2 | 4 | 171,199,104 | 80,736 | 28,533,184 | 26,912 |
| 300% | 2 | 1 | 385,002,816 | 88,752 | 256,668,544 | 59,168 |
| 300% | 2 | 4 | 1,540,011,264 | 177,504 | 256,668,544 | 59,168 |

At 300% and DPR 2, one page requests 96,250,704 canvas pixels before and 22,188
after. Total ImageData reads fall from 256,786,880 bytes to 88,752 bytes. The
combined canvas/comparison-buffer upper bound falls from 641,671,360 bytes to
147,920 bytes. For four pages that upper bound is 1,796,679,808 before and 236,672
after. These counts are stable across the five samples.

Each mark occupies one tile in this fixture. Both versions perform two page
paints and three ImageData reads per page, including the native ink destination
read. Comparison iterations per page fall from the full-page retained-pixel count
to the affected-region count in the first table. The fixed overlay limits a work
unit to 65,536 pixels, a page to 1,048,576 retained pixels, and mounted overlays to
4,194,304 pixels including two shared scratch tiles. It releases scratch storage
before yielding between tiles.

At 300%/DPR 2 the old renderer uses eight pixels per point; the new resolution cap
uses four. The other three conditions keep the requested resolution. Therefore
this is not a claim of byte-identical output between eight- and four-pixel
rasterizations. Destination-dependent operations retain their semantics at the
chosen resolution, while stored ink geometry and samples remain unchanged.

## Correctness evidence

- 21 focused tests and 432 assertions passed under the shared lock, including
  exact cropped-versus-full ink pixels for XOR, mask and not-merge operations at
  scales 4/3, 2.3 and 8, plus finite-budget and extreme-dimension cases.
- Three browser tests passed: full-page reference pixel equivalence at the same
  scale, fallback/decode isolation, cancellation between tiles, and 32 mounted
  pages sharing scratch storage. The reference comparison ignores RGB values of
  fully transparent pixels and compares every visible channel and alpha exactly.
- A later one-test check passed for empty painted image bounds, which must not
  trigger image decoding. TypeScript and Svelte checks passed before that narrow
  guard; final-head CI covers the complete change.
- The two crop/decode unit repros fail against the audit painter and ink-canvas
  files. The old crop exceeds its 437-pixel budget; the old painter requests the
  unrelated image and throws. Both pass with the fix.
- Against the verbatim audit Svelte component, the browser repro reports one
  error for an unrelated corrupt image and leaves the ink fallback hidden. An
  overlapping corrupt image also leaves the fallback hidden. With the fix, the
  unrelated failure produces no overlay error, while an overlapping failure
  keeps the fallback visible and reports the error.

These checks establish the scoped behavior above. They do not establish general
Word, ECMA or MS interoperability, or validate the whole implementation's security.

## Reproduce

Install frozen dependencies with `bun install --frozen-lockfile`. The browser
configuration uses `/usr/bin/google-chrome`, or the `CHROMIUM_PATH` override.

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 12m scripts/benchmark-word-ink-overlay.sh /tmp/word-ink-results
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 3m bun test packages/word/test/canvas-paint.test.ts packages/svelte/test/word-ink-tiles.test.ts
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 3m bun run --cwd apps/docs test:e2e --config playwright.ink.config.ts
```

To reproduce the browser failure before the fix, copy the audit component to
`apps/docs/src/lib/test-fixtures/WordInkPageLayer.audit.svelte` using `git show`,
then run the browser command with
`VITE_INK_BASELINE=/src/lib/test-fixtures/WordInkPageLayer.audit.svelte` and
`-g 'decode failure only'`. It must fail with the two hidden-fallback outcomes
above. Remove the copied component afterward. For the unit before-repro, temporarily
restore only `packages/word/src/canvas-paint.ts` and `packages/word/src/ink-canvas.ts`
from the same audit commit, run `bun test packages/word/test/canvas-paint.test.ts
-t 'cropped destination|unrelated image'`, then restore the fixed files. Run these
before/after sequences under one shared lock, with backups and an exit trap.
