# SpreadsheetML implementation status

This is Tumbler's first visible Office-format slice. It is browser-compatible,
headless below the rendering package, and uses a Svelte head whose DOM and CSS
belong entirely to Tumbler.

## Standards coverage

The implementation is derived from the vendored ECMA-376 Part 1 text. The
current requirement boundary is:

| Clause | Implemented behavior |
| --- | --- |
| §12.3.23 | Workbook discovered as the package office-document target; no fixed `/xl/workbook.xml` assumption |
| §12.3.24 | Ordinary worksheets resolved from each `sheet` relationship and required worksheet media type |
| §18.2.19–20, §18.2.27 | Ordered sheet collection; required name, unsigned `sheetId`, relationship ID, and visibility state; unique names and IDs |
| §18.3.1.4 | Sparse cells, references, style indexes, formulas, cached values, and standard cell type tags |
| §18.3.1.13, §18.3.1.35, §18.3.1.73 | Column spans/widths, used dimension, row index/height/hidden state |
| §18.3.1.53–55 | Inline rich strings and non-overlapping merged ranges |
| §18.3.1.66, §18.3.1.87–88 | Split/frozen pane state from worksheet views |
| §18.4.8–9, §18.4.12 | Shared string tables, rich runs, significant whitespace, and exclusion of phonetic hints from displayed base text |
| §18.18.11 | `b`, `d`, `e`, `inlineStr`, `n`, `s`, and `str` cell types |

Both Strict and Transitional vocabulary and relationship namespaces are tested.
This table is a feature boundary, not a claim of complete conformance to those
clauses or to SpreadsheetML as a whole.

## Public behavior now available

`@tumbler/sheets` can:

- open an OPC spreadsheet package and enumerate ordinary worksheets in tab order;
- address sheets by case-insensitive name or numeric identity;
- open a worksheet into sparse rows and cells without allocating the Excel grid;
- read numbers, booleans, errors, ISO date strings, shared strings, inline rich
  strings, and formula string results;
- retain formula text separately from its stored result;
- expose dimensions, merges, column ranges, row layout, and pane state;
- stage literal string, finite-number, boolean, and clear operations;
- add missing rows/cells in coordinate order, expand dimensions, save, and reopen;
- leave a semantic no-op byte-identical and copy untouched ZIP payloads exactly.

Literal text writes use `inlineStr`. This avoids a workbook-wide shared-string
reindex for a local edit. Replacing a formula with a literal intentionally
removes the formula. Existing style and unknown cell attributes/children are
retained inside the rewritten target cell; unrelated worksheet source and
unrelated package parts are not reserialized.

`@tumbler/core` supplies one-based, immutable selection and arrow-navigation
primitives. `@tumbler/svelte` supplies `SpreadsheetGrid`, an owned virtualized
surface with row/column headers, click and shift selection, keyboard navigation,
an inline editor, and selection/edit callbacks. Its pure viewport calculator is
usable independently of Svelte.

## Deliberate current limits

- Only ordinary worksheet sheet targets are accepted. Chart sheets, dialog
  sheets, macro sheets, and external sheet targets are diagnosed as unsupported.
- Styles are indexed but not yet parsed, computed, or rendered. Number formats,
  dates stored as serial numbers, themes, borders, fills, and fonts are pending.
- The Svelte grid currently uses fixed virtual row and column sizes. Parsed
  custom sizes, hidden axes, merged-cell geometry, and frozen panes are not yet
  applied to layout.
- Formulas are preserved and exposed with cached values, but not tokenized,
  calculated, or editable. Structural row/column edits do not exist.
- Tables, filters, validations, conditional formats, comments, hyperlinks,
  drawings, charts, pivots, names, and external links are preserved as unknown
  content but have no semantic or visual model.
- Editing an existing rich/shared string replaces that cell's value with a plain
  inline string; run formatting and phonetic annotations are not retained for
  the intentionally replaced value.
- No Microsoft Excel, LibreOffice, Apache POI, or Open XML SDK consumer pass has
  been recorded yet. Synthetic and property tests are structural evidence, not
  interoperability certification.

## Next qualification boundary

The next useful slice is styles plus number-format display, followed by variable
axis geometry and merged/frozen rendering. Before calling the slice
interoperable, generated and real-producer fixtures must pass Open XML SDK
validation and open/save cycles in LibreOffice and Excel without repair.
