# Word picture geometry audit evidence

This change addresses imported picture crop, rotation and reflection, and DOM floating drawing order. It does not establish general Word conformance or security.

## Rendering and editing scope

`a:srcRect` defines signed offsets from source image edges. The parser accepts integer thousandths of a percent and percentage strings. The shared geometry stretches the selected source rectangle into the picture frame; negative offsets leave transparent padding. Painting clips in picture coordinates, reflects, then rotates clockwise about the frame centre. DOM and canvas use the same destination rectangle.

The editing frame remains unrotated. Movement and resizing preserve crop/transform XML and image bytes. Strict and Transitional export, undo and redo are tested. Standalone rectangular pictures are supported. Groups, tiles, non-default fill rectangles, nonrectangular masks, nonrotating fills with rotation, and local extents different from the drawing frame return an explicit unsupported drawing while preserving source XML. Picture effects and complete tight/through wrapping remain outside this change.

The DOM uses compact per-page stacking ranks, preserving unsigned `relativeHeight` ordering and stable ties within front/behind layers. Canvas already sorts this way. The shared `wordImagePaintBounds` returns the AABB of the visible image after frame clipping, reflection and rotation. Negative crop padding is excluded. Bounds use drawing-relative points and scale with the supplied frame dimensions; an entirely clipped image has zero width and height. Ink projections keep their existing bounds. DOM picture wrappers use the original frame for placement and editing. PR126 can use the helper unchanged for region decoding and viewport culling after PR120 is integrated.

References: [source rectangles](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.sourcerectangle?view=openxml-3.0.1) and [2D transforms](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.transform2d?view=openxml-3.0.1), which reproduce the relevant ISO/IEC 29500 definitions. No Microsoft Word reference rendering was inspected.

## Behavioral checks

The generated fixture embeds a four-colour SVG image, with no private document data or external resources. The browser checks sample actual DOM screenshots and canvas pixels for left crop, horizontal reflection after crop, vertical reflection, clockwise rotation after reflection, and negative crop. Four pixels per painter per case give 40 asserted RGBA samples. A sixth check verifies overlapping DOM drawings whose relativeHeight values are 4294967295, 2147483648 and zero.

The baseline audit commit fails all six browser checks with the same generated fixtures and browser: all five picture cases fail their canvas RGBA assertion, and DOM stacking selects element 59 instead of the expected element 5. The after run passes all six, including all 40 DOM/canvas RGBA samples. The baseline picture checks stop at the first canvas assertion, so they do not independently assert DOM failure. An initial baseline attempt failed because its configuration loaded Playwright from both checkouts; that discarded attempt provides no behavioral evidence.

The first CI validation ran 1,439 tests, passing 1,438. Its only failure was an anchor-alignment fixture that placed a bare blip directly in graphicData. The fixture now uses a standalone picture and explicitly asserts an image model. All 18 alignment and picture geometry tests pass after that correction. Existing alignment and movement expectations are unchanged. With the rotated-bounds extension, the full local suite passed 1,442 tests across 173 files with 296,627 assertions in 40.85 seconds. TypeScript and Svelte checks passed, the latter with zero errors and warnings. Updating the queued runner to remove a redundant docs build raced with startup and caused a stray shell command after the successful suite; its summary status of 127 refers to that wrapper error, not a failed Bun test. The complete test log records zero failures.

## Picture and ink integration

A detached temporary checkout combines picture commit `3af53e15fa7bb99bebcac11a0a2d9ba0dae0b2e3` with ink commits `a17e6fa` and `92fdd6b`. Neither real branch was merged. The only conflict was the canvas-paint imports; both imports were retained. The ink branch subsequently added zero-area guards, which do not affect these nonempty image cases.

The integration test places ink above the unrotated picture frame, inside the picture's rotated AABB. A second rotated image at a distant position has deliberately invalid bytes. The two runs use the same combined checkout, generated fixtures, Chrome and shared lock; only `image-paint.ts` changes between the old frame-only helper and the new AABB helper.

- Before: the valid picture is excluded, and 57 overlay pixels differ from the full-page reference.
- After: the valid picture is included, and zero overlay pixels differ. The test also requires coloured ink pixels and a nonempty overlay.
- Both: the unrotated frame misses every tile, the unrelated broken picture is excluded, and no decode error occurs. The after overlay reaches its ready state.

The old-helper test fails in 2.1 seconds. The new-helper test passes in 1.6 seconds, 6.7 seconds including server startup. These are functional test durations, not performance claims. The helper contract and test are in commit `3af53e1`. Integrate PR120 before PR126 so its unchanged region-selection and viewport-culling calls consume the new bounds.

## Matched performance measurements

Baseline: `4d1465ddf85ee238a727dbed75aac7bf043f05f8`. Implementation: `2a1b93bd89b6cc6c3604f857bc31e84302b554fd`.

All four runs used Bun 1.4.4 on the same Intel Celeron N5095 at 2 GHz, with four logical CPUs. One advisory lock covered the complete before/after/after/before sequence. No tests from this thread ran concurrently. Other audit workers used the same lock; unrelated host activity and JIT/GC variability remain possible. The repeat reverses order to expose noise. No speedup is claimed.

Each measurement has three warmup batches and seven recorded samples. Import batches contain 20 opens of the same generated DOCX. Paint batches contain 5,000 page paints with one already-decoded image represented by a counting canvas context. This measures command generation, not decoding, GPU work, browser rasterization or DOM rendering.

Median batch milliseconds, first pair then reverse-order repeat:

| Workload | Before | After | Before repeat | After repeat |
| --- | ---: | ---: | ---: | ---: |
| Import ordinary picture, 20 opens | 29.556 | 22.087 | 17.832 | 22.871 |
| Import cropped/rotated/flipped picture, 20 opens | 16.002 | 19.508 | 14.391 | 15.619 |
| Ordinary picture commands, 5,000 paints | 11.665 | 11.601 | 12.251 | 12.765 |
| Transformed picture commands, 5,000 paints | 10.231 | 17.096 | 10.040 | 16.861 |

Ordinary pictures keep eight canvas operations and one image draw per page. Transformed pictures increase from eight to seventeen operations, still with one image draw. The added median command cost is about 1.37 microseconds per image in both pairs. The ordinary coordinate checksum stays 252 before and after; the transformed checksum changes from 252 to 108 because the formerly ignored crop now changes the destination rectangle. This checksum is a command witness, not a pixel-equivalence test. All four runs preserve the input DOCX bytes exactly for both fixtures.

Post-GC retained-heap deltas and RSS are recorded for every batch in [the raw samples](../tools/word-picture-benchmark-results.json). Retained deltas fluctuate around zero and include GC noise; they are not total allocated bytes. Paint-stage RSS spans about 62–65 MB across the runs. There is no offscreen pixel buffer in this implementation; transformed painting creates one small destination-rectangle object per image. Allocation totals and peak browser/GPU memory were not measured.

## Reproduction

Install both checkouts with `bun install --frozen-lockfile`. Keep the baseline at the audit SHA. Run from the implementation checkout, using the same benchmark file for both revisions:

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock bash -c '
  bun tools/word-picture-benchmark.ts /absolute/baseline > before.json
  bun tools/word-picture-benchmark.ts . > after.json
  bun tools/word-picture-benchmark.ts . > after-repeat.json
  bun tools/word-picture-benchmark.ts /absolute/baseline > before-repeat.json
'
```

For the browser reproduction, copy `packages/word/test/picture-fixture.ts` and `apps/docs/e2e/word-picture.e2e.ts` unchanged into the baseline checkout. Run each checkout sequentially with the shared lock and no existing server on port 4175:

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock env CHROMIUM_PATH=/usr/bin/google-chrome CI=1 \
  bun run --cwd apps/docs test:e2e e2e/word-picture.e2e.ts
```

The recorded after run used the same repository Playwright settings, an isolated port 4189 and a 90-second test timeout to avoid other audit workers' servers. It took 39.3 seconds total; the longest test took 11.1 seconds. Timings from browser functional tests are not a rendering benchmark.

For the combined integration test, create a detached checkout of PR120 and cherry-pick both ink commits in order. Preserve both imports if `canvas-paint.ts` conflicts. Install with Bun, then add this temporary config beside the existing docs Playwright config:

```ts
// apps/docs/playwright.picture-ink.config.ts
import config from './playwright.config.ts';
export default { ...config, testMatch: '**/word-picture-ink.integration.ts' };
```

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock env CHROMIUM_PATH=/usr/bin/google-chrome CI=1 \
  timeout 10m bun run --cwd apps/docs test:e2e --config playwright.picture-ink.config.ts
```

Save the current `packages/word/src/image-paint.ts`, replace it temporarily with the version from `2a1b93b`, and run the same command for the failing-before result. Restore the saved file for the passing-after result. The recorded integration used isolated port 4191; the configuration above uses the repository's default port 4175. Keep the paired runs under a single shared lock when comparing them.

## Composited ink above ranked drawings

The second independent review found that the third front picture could have rank 4 while the ink overlay remained at rank 3. The page now sets `--word-ink-layer-z-index` to one greater than its highest drawing rank. `WordInkPageLayer` consumes this property with fallback 3 for standalone hosts and retains `pointer-events: none`. Hosts that assign drawing ranks must provide the property. PR126 must retain the identical CSS declaration when replacing the canvas with tiles.

A generated DOCX places three overlapping front pictures below white XOR ink. The mounted DOM screenshot samples the same 32 by 32 pixel region as the full-page canvas reference. With the old fixed rank, the canvas contains 26 cyan ink pixels and the DOM contains 0. With the dynamic rank, both contain 26. The before run fails the visible-ink assertion; the after run passes. Screenshots: [before](assets/word-picture-ink-before.png), [after](assets/word-picture-ink-after.png).

The focused after run passed all seven picture browser tests in 23.1 seconds. TypeScript and Svelte checks also passed, with zero Svelte errors or warnings. Run `word-picture-stacking.e2e.ts` through the same locked browser command above to reproduce; temporarily replace the CSS variable with `z-index: 3` for the failing case. These checks used the same Chrome, generated fixture, zoom and screenshot region. They are correctness evidence, not timing benchmarks.

One accidentally broad browser invocation was cancelled by terminating only its verified owned timeout process. Its partial results were discarded; the seven-test focused run above replaced it. No full suite or performance benchmark was repeated for this change.
