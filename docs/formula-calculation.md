# Formula calculation

Tumbler calculates supported formulas locally without changing their OOXML
source or pretending to implement the complete Excel language.

## Boundary

`@tumbler/formulas` parses stored formula text without the UI's leading `=` and
produces typed syntax trees. Its evaluator accepts a workbook adapter rather
than importing SpreadsheetML. `@tumbler/sheets` supplies that adapter and exposes
an immutable `SpreadsheetCalculationSnapshot` on each `SpreadsheetArtifact`.

The renderer uses a calculated value first, then the producer's cached value,
then blank. An unsupported formula never overwrites a valid producer cache.
Calculation output is not written into `<v>` elements in this milestone.

## Supported first slice

- finite numeric, string, boolean, and standard error literals;
- unary `+`/`-`, percent, arithmetic, exponentiation, concatenation, and comparisons;
- relative/absolute A1 cells, rectangular ranges, and sheet-qualified references;
- `IF`, `SUM`, `COUNT`, `AVERAGE`, `MIN`, `MAX`, `AND`, `OR`, and `NOT`;
- dependency ordering, cross-sheet dependencies, circular-reference diagnostics,
  and recalculation after supported scalar edits.

Parsing follows the MS-XLSX formula grammar boundary. Evaluation behavior is
qualified incrementally against ECMA-376 function definitions and real consumers.

## Safety and determinism

Formula text is never passed to JavaScript evaluation. Calculation limits the
formula inventory, expanded range cells, operation count, and dependency depth.
Limits produce diagnostics and cached-value fallback rather than unbounded work.

Volatile functions, external workbooks, structured references, defined names,
shared/array/data-table formulas, dynamic arrays, iterative calculation, locale
variants, and unsupported functions remain outside this slice.
