# Word property ordering audit

These fixtures target audit findings 5 and 6 at baseline
`4d1465ddf85ee238a727dbed75aac7bf043f05f8`. They do not establish general Word
conformance or Microsoft Word repair behavior.

## Reproduce

Use Bun and Python with lxml. Obtain `OfficeOpenXML-XMLSchema-Transitional.zip`
from [ECMA-376 Part 4](https://ecma-international.org/wp-content/uploads/ECMA-376-4_5th_edition_december_2016.zip)
and `OfficeOpenXML-XMLSchema-Strict.zip` from the official Part 1 archive.

```sh
bun test packages/word/test/schema-order.test.ts
bun tools/word-schema-order/generate.ts /tmp/word-schema-after
python3 tools/word-schema-order/validate.py transitional /path/to/OfficeOpenXML-XMLSchema-Transitional.zip /tmp/word-schema-after/*-transitional.docx
python3 tools/word-schema-order/validate.py strict /path/to/OfficeOpenXML-XMLSchema-Strict.zip /tmp/word-schema-after/*-strict.docx
```

The validator supplies the standard XML namespace attributes omitted from ECMA's
import location. The published Strict WML XSD contains three `ST_OnOff` defaults
spelled `off`, which its own type rejects. The validator changes these defaults
to `false` in its temporary copy so libxml2 can compile the schema. It does not
change any instance constraint or element order.

Copy this tools directory into a checkout of the baseline commit and run the
same generator there, writing `/tmp/word-schema-before`. Compare package parts:

```sh
python3 tools/word-schema-order/compare.py /tmp/word-schema-before /tmp/word-schema-after
```

Comparison permits only cell/paragraph property ordering, border ordering, empty
tab omission and omission of the resulting empty paragraph property container.
All other XML content and package parts must match. The fixed fixture set has
four cases in each dialect. The extra combinations fixture covers all 24 border
insertion orders and all 16 subsets of supported cell formatting.

## Behavioral results

Before the fix, the focused authoring tests fail on cell order, border order and
empty tabs. Afterward they pass, along with a source-edit test proving explicit
`[]` removes old direct tabs while omitted tabs preserve them in both dialects.

Official Transitional XSD: the three reported repros fail before and pass after.
The explicit-clear control passes both. The combined permutation/subset document
also passes after. All ten fixture packages compare equivalent under
the narrow normalization above.

Strict paragraph borders and empty tabs fail before and pass after; explicit
clear passes both. Strict tables still fail on pre-existing dialect issues:
numeric `tblW`/`tcW`/`tcMar` widths lack required units, and table borders and cell
margins use `left`/`right` where Strict requires `start`/`end`. These are outside
this ordering fix. The Strict validation command intentionally reports them.

No Microsoft Word application roundtrip was performed.

## Timing method

Run `bun tools/word-schema-order/benchmark.ts` from baseline and fixed checkouts
on the same host under one advisory lock, with the same copied script and
fixtures. Each operation serializes 400 top-level blocks, including 200 cells.
There are 20 warmups followed by 15 samples of 20 operations, with a full GC before
each sample. Measurements cover authored XML generation only, excluding ZIP,
parsing and validation. No tests run concurrently with these measurements.

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock bash /tmp/matched-word-order-benchmark.sh
```

The shell script should change into the baseline checkout, run the benchmark,
then change into the fixed checkout and run it again. Do not acquire nested locks.
`heapDeltas` are observed live heap growth across each sample, not allocated-byte
counts, and may include GC effects. `maxRssKiB` is process peak RSS. This shared
host has background contention; timings are observations, not a speedup claim.

The recorded locked run used Bun 1.4.4 on an Intel Celeron N5095 with four logical
CPUs. Median time per operation was 4.165 ms before and 3.758 ms after. Sample
ranges were 2.698–5.718 ms and 3.210–5.551 ms. Output decreased from 194,900 to
191,700 bytes by omitting 100 empty `tabs` containers and their empty `pPr`
containers. Each revision performed 320 serializations including warmups.
Peak RSS was 65,164 KiB before and 66,416 KiB after. Median observed live heap
growth per 20-operation sample was 4,050,032 bytes before and 2,984,958 after.
Raw timing and heap samples are in `results/before.json` and `results/after.json`.
There is no allocated-byte counter in this measurement.

The initial run without the lock had an 18.321 ms baseline median and was
discarded because competing workloads dominated it. The locked results above
use identical runtime, hardware, fixtures and measurement code. Background work
outside the advisory lock remains a limitation. No speedup is claimed.

For the tooling typecheck, run `bunx tsc --noEmit -p tools/word-schema-order/tsconfig.json`
under the same advisory lock.
