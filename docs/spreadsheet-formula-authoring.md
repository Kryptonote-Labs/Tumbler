# Spreadsheet formula authoring

This milestone joins Tumbler's bounded formula grammar and immutable calculation
overlay to an explicit formula-bar editing path. Inline cell editing remains
literal: only the formula bar interprets a leading `=` as formula source.

## Standards boundary

The implementation follows ECMA-376 Part 1 §18.3.1.40 and §18.17.2–7, plus the
formula grammar extensions documented by MS-XLSX §2.2.2. Formula source is
stored in the worksheet cell without the UI-only leading equals sign.

## Included

- ordinary scalar formulas in the supported grammar;
- relative, absolute, and mixed A1 references and rectangular ranges;
- case-insensitive same- and cross-sheet resolution;
- quoted sheet names, including doubled apostrophe escaping;
- caret insertion, selected-text replacement, and pointer-drag range growth;
- worksheet switching while retaining the formula's original target cell;
- bounded transitive calculation across worksheets;
- stale cache and calculation-chain invalidation on save;
- full-recalculation requests for external spreadsheet consumers.

The host owns sheet tabs and grid selection. It supplies monotonic reference-pick
identities so selecting the same cell twice is still an observable user action.
Document-provided external workbook targets are never fetched.

## Deliberately deferred

- shared, array, data-table, and dynamic-array formulas;
- structured table references, defined names, and external workbook references;
- reference rewriting after row, column, or worksheet structural edits;
- writing producer formula caches;
- the full Excel function catalog, volatile functions, iterative calculation,
  and locale-specific formula separators.

Unsupported existing formulas remain preserved and may use producer-cached
values for display. Tumbler rejects unsupported formula writes rather than
flattening special formula structures into ordinary cells.

## Qualification boundary

Unit and property tests cover parsing, bounded evaluation, circular references,
same- and cross-sheet dependencies, safe quoting, caret/range insertion, target
retention, save/reopen behavior, and calculation metadata invalidation. Before
calling formula writing interoperable, representative real-producer fixtures
must round-trip through Excel, LibreOffice, Open XML SDK, and an independent
reader without repairs or unexplained semantic drift.
