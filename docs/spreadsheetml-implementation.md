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
| §18.8.2–45 | First stylesheet projection: fonts, fills, borders, colors, alignment, cell formats, base-style inheritance, and number-format records |
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
- resolve cell style indexes into fonts, solid fills, borders, alignment, and
  number formats;
- format common decimals, grouping, percentages, scientific values, fractions,
  dates, and times while retaining raw values and workbook date-system identity;
- stage literal string, finite-number, boolean, and clear operations;
- add missing rows/cells in coordinate order, expand dimensions, save, and reopen;
- leave a semantic no-op byte-identical and copy untouched ZIP payloads exactly.

Literal text writes use `inlineStr`. This avoids a workbook-wide shared-string
reindex for a local edit. Replacing a formula with a literal intentionally
removes the formula. Existing style and unknown cell attributes/children are
retained inside the rewritten target cell; unrelated worksheet source and
unrelated package parts are not reserialized.

`@tumbler/core` supplies one-based, immutable selection and arrow-navigation
primitives plus sparse variable-axis geometry. `@tumbler/svelte` supplies
`SpreadsheetGrid`, an owned virtualized surface with row/column headers, click
and shift selection, keyboard navigation, styled display, merged cells, frozen
regions, an inline editor, and typed selection/edit callbacks. Its pure viewport
and grid-layout calculators are usable independently of Svelte.

`SpreadsheetArtifact` is the host boundary intended for Kryptonote. It opens
artefact bytes, chooses and retains an active sheet, exposes the renderable
worksheet, applies typed cell edits, returns saved bytes, and replaces its model
from agent-produced revisions while retaining the selected sheet when possible.

Cell style colors retain their source identity while the renderer computes an
opaque sRGB projection. Explicit SpreadsheetML RGB colors ignore the alpha byte,
as required for cell styles and expected by producers that routinely emit a
`00` prefix. Theme colors resolve through the workbook Theme part, indexed
colors use a custom or standard palette, and SpreadsheetML tints are applied in
HSL space.

## Deliberate current limits

- Only ordinary worksheet sheet targets are accepted. Chart sheets, dialog
  sheets, macro sheets, and external sheet targets are diagnosed as unsupported.
- Unsupported DrawingML theme color expressions remain preserved but unresolved;
  the current computed view supports sRGB and system-color fallbacks.
- The number-format interpreter covers the common built-ins and a useful custom
  subset. It does not yet implement the entire conditional, locale/currency,
  elapsed-time, fill-character, and fraction language from §18.8.31.
- Column pixels currently use the standard formula with a seven-pixel maximum
  digit-width estimate. The browser head does not yet measure the workbook's
  actual normal-style font metrics.
- Merges wholly within one scrolling or frozen region render as one cell.
  Merges crossing a frozen-pane boundary still need quadrant clipping.
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

The next useful slice is font measurement and real-producer visual
qualification. Before calling the slice interoperable, generated and
real-producer fixtures must pass Open XML SDK validation and open/save cycles in
LibreOffice and Excel without repair.
