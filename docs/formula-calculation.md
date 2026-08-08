# Formula calculation

Tumbler calculates supported formulas locally without changing their OOXML
source or pretending to implement the complete Excel language.

## Boundary

`@tumblerjs/formulas` parses stored formula text without the UI's leading `=` and
produces typed syntax trees. Its evaluator accepts a workbook adapter rather
than importing SpreadsheetML. `@tumblerjs/sheets` supplies that adapter and exposes
an immutable `SpreadsheetCalculationSnapshot` on each `SpreadsheetArtifact`.

The renderer uses a calculated value first, then the producer's cached value,
then blank. An unsupported formula never overwrites a valid producer cache.
Calculation output is not written into `<v>` elements in this milestone.

## Supported slice

- finite numeric, string, boolean, and standard error literals;
- unary `+`/`-`, percent, arithmetic, exponentiation, concatenation, and comparisons;
- relative/absolute A1 cells, rectangular ranges, and sheet-qualified references;
- `IF`, `SUM`, `COUNT`, `AVERAGE`, `MIN`, `MAX`, `AND`, `OR`, and `NOT`;
- `COUNTIF`, `SUMIF`, and `AVERAGEIF`, including scalar numeric, boolean, and
  text criteria, comparison operators, case-insensitive text matching, and `*`
  and `?` wildcards with `~` escaping;
- dependency ordering, cross-sheet dependencies, circular-reference diagnostics,
  and recalculation after supported scalar edits.

Parsing follows the MS-XLSX formula grammar boundary. Evaluation behavior is
qualified incrementally against ECMA-376 function definitions and real consumers.

## Conditional aggregate semantics

The function signatures and range behavior follow ECMA-376 Part 1
§18.17.7.20 (`AVERAGEIF`), §18.17.7.55 (`COUNTIF`), and §18.17.7.307
(`SUMIF`). In particular, an optional result range is aligned from its top-left
cell and projected to the criteria range's dimensions; its declared range does
not need the same shape. Projected cells participate in dependency discovery,
including across worksheets.

Criteria are evaluated once as scalars. Text criteria accept `=`, `<>`, `<`,
`<=`, `>`, or `>=`; numeric and boolean operands are compared to the same cell
type. Equality text matching is case-insensitive. `*` matches zero or more text
characters, `?` matches one, and `~` escapes `*`, `?`, or `~`. Wildcards do not
coerce numbers or booleans to text. An empty-string criterion matches blank and
empty-string cells, while a blank criterion reference is treated as numeric
zero. A quoted error such as `"#N/A"` can match that cell error; an unquoted
error criterion propagates the error. As required specifically by `AVERAGEIF`,
boolean cells in its inspected range are ignored even for a boolean criterion.

Selected numeric cells contribute to `SUMIF` and `AVERAGEIF`; blank, text, and
boolean result cells are ignored. An error in a selected result cell propagates.
When `AVERAGEIF` selects no numeric result, Tumbler returns `#DIV/0!`. ECMA-376
leaves the no-match result unspecified, so that choice is an explicitly tested
Excel-compatible producer behavior rather than a conformance claim.

Criteria must remain scalar and criteria/result arguments must be A1 references
or rectangular ranges. Structured references, defined names, external books,
and projections beyond worksheet bounds remain unsupported instead of being
guessed. `SUMIFS`, `COUNTIFS`, and `AVERAGEIFS` are not included yet.

## Safety and determinism

Formula text is never passed to JavaScript evaluation. Calculation limits the
formula inventory, expanded range cells, operation count, dependency depth, and
criteria text to 8,192 Unicode characters. Wildcards use a bounded greedy glob
matcher rather than dynamic regular expressions. Limits produce diagnostics and
cached-value fallback rather than unbounded work.

Volatile functions, external workbooks, structured references, defined names,
shared/array/data-table formulas, dynamic arrays, iterative calculation, locale
variants, and unsupported functions remain outside this slice.
