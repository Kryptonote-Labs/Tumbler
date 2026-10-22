# Word line-layout audit evidence

These fixtures cover audit findings 3, 11, and 12. They do not establish general
Word compliance or security.

## Reproduction

The baseline is `4d1465ddf85ee238a727dbed75aac7bf043f05f8`; the measured implementation
is `cad923a6ca010c23cc65be5e42fca76d10dea64a`. Both use the same generated fixture
strings, fixed five-point-per-UTF-16-unit measurer, Bun 1.4.4, and Intel Celeron
N5095 host with four logical CPUs. Parsing occurs before the timed loop. Each case
has four warmups and twelve recorded samples. Each sample runs a full GC before
timing layout plus geometry serialization/hash calculation. The reported median
is the seventh sorted sample. Raw samples are in `results/`.

Prepare a baseline checkout with `git archive` and install its frozen dependencies
with Bun. From the implementation checkout, save and run this sequence under one
lock. `WORD_LAYOUT_ROOT` selects the implementation imported by the same runner.

```sh
cat > /tmp/word-line-evidence.sh <<'SH'
set -eu
WORD_LAYOUT_ROOT=/tmp/word-line-baseline timeout 5m bun tools/word-layout-audit/benchmark.ts > /tmp/before.jsonl
timeout 5m bun tools/word-layout-audit/benchmark.ts > /tmp/after.jsonl
WORD_LAYOUT_ROOT=/tmp/word-line-baseline timeout 5m bun tools/word-layout-audit/chromium.ts > /tmp/chromium-before.jsonl
timeout 5m bun tools/word-layout-audit/chromium.ts > /tmp/chromium-after.jsonl
SH
flock -x /tmp/tumbler-word-audit-heavy.lock bash /tmp/word-line-evidence.sh
```

The Chromium runner uses the repository's Playwright dependency and
`/usr/bin/google-chrome`, or `CHROMIUM_PATH`. It bundles the selected source with
Bun and runs the same generated 150,000-space fixture in Chrome 156.0.8078.47.
The recorded pair held the shared lock throughout, with no concurrent tests from
this thread. Other host activity can still affect timings. An earlier timing run
overlapped a short focused test and was discarded; it is not in `results/`.

## Before and after

- **Budgeted spaces:** 150,000 spaces, `maxCharacters: 1000`, `maxAtoms: 1000`,
  `maxMeasurements: 1001`, `maxFragments: 1`, `maxPages: 1`. Before: 150,001
  measurements, zero fragments, no budget error in Bun. After: 1,001 measurements
  and `limit_exceeded`. Median time 120.98 → 2.59 ms; ranges 101.65–270.33 →
  2.11–4.48 ms. Median observed heap delta 29,900,568 → 0 bytes.
- **Permitted spaces:** 150,000 spaces with preparation budgets above that size.
  Both make 150,001 measurements and produce zero fragments with logical end
  offset 150,000. Layout hashes match, `9904269968101082496`. Median time
  108.17 → 103.24 ms; ranges 95.43–149.88 → 94.40–254.02 ms. Median observed heap
  delta 28,332,504 → 24,612,819 bytes. The overlapping ranges do not support a
  timing improvement claim for this case.
- **Long preview:** 40,000 repetitions of `word ` in one paragraph, `pageLimit: 1`.
  Measurements 200,001 → 142; six prepared output fragments in both. Returned
  layout hashes match, `13723528332943908277`. Median time 220.58 → 1.52 ms;
  ranges 186.07–258.63 → 1.21–6.92 ms. Median observed heap delta 38,395,634 → 0
  bytes. The operation reduction comes from stopping paragraph preparation.
- **Ordinary full layout:** 200 repetitions of `word `, no preview limit.
  Both make 1,001 measurements and produce 50 fragments. Hashes match,
  `17143992011958039305`. Median time 3.17 → 3.28 ms; ranges 2.69–3.55 →
  2.55–4.40 ms. Both observed heap deltas are zero. No general speedup claim.

Heap deltas are `process.memoryUsage().heapUsed` immediately after the timed
operation minus the post-GC value. They are coarse live-heap observations, not
allocated-byte totals or peak RSS. A zero does not mean no allocation. The
measurement-call counts are exact; the runner does not instrument allocation
counts or atom creation separately.

Chrome reproduces the baseline `RangeError: Maximum call stack size exceeded`
after 150,001 measurements, both with and without the newly introduced budgets.
The implementation completes the permitted case and rejects the budgeted case
after 1,001 measurements. This checks the actual browser argument-count failure,
which Bun does not reproduce.

## Behavioral and renderer checks

The original focused repros copied into the audit checkout failed before the
changes: preparation 3 failed/1 passed, line breaking 2 failed, justification 2
failed. After:

- The 50-point NBSP fixture wraps as `aa` / `bbbb cccc` with widths 10 / 45, rather
  than splitting the non-breaking group. U+202F and U+2007 have the same coverage.
- Terminal explicit line breaks preserve the final empty line, height, and caret
  offset; repeated breaks are covered.
- The 100-point justified fixture's first line expands from 90 to 100 points;
  the final line remains 70 points. Expanded spaces retain logical offsets.
- Decimal-tab preview lookahead stops at the decimal point within 200 measurement
  calls. `doNotExpandShiftReturn` suppresses soft-break expansion, including newly
  created native headers and footers. Native and exported line widths agree at
  35 / 25 points on repeated cached layouts.
- Chrome verifies DOM width, expanded-space range geometry, and caret hits on both
  sides of the space. Canvas tests verify text positions and underline advances.

At measured implementation `cad923a`, the locked local checks passed:
`bun run check`; `bun test` with 1,440 passing tests and 296,859 assertions;
`bun run docs:check` with zero errors/warnings; and three Playwright tests:
`word-justification.e2e.ts`, `word-wrapping.e2e.ts`, and
`word-horizontal-spacing.e2e.ts`. Full docs build and other required checks run in
PR CI. No duplicate local broad suite is needed for this evidence-only commit.

## Scope and interoperability

Preparation limits are caller-selected work limits, not document authoring caps.
Body paragraphs are incremental. Tables and stories remain eager within budgets;
center/right tab alignment may need a full following segment. Emergency wrapping
of oversized unbreakable text remains unchanged. This is not a complete Unicode
line-breaking implementation.

The line-break and justification behavior follows the relevant
[Unicode line-breaking guidance](https://www.unicode.org/reports/tr14/),
[WordprocessingML break definition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.break?view=openxml-3.0.1),
and [soft-break compatibility rule](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.donotexpandshiftreturn?view=openxml-3.0.1).
