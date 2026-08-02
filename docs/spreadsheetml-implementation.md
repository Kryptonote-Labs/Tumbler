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
| §18.3.1.82–83 | Worksheet tab colors with RGB, theme, indexed, and tint identity and resolution |
| §18.2.2, §18.6.2 | Workbook calculation mode/flags and calculation-chain identity; literal edits remove stale chains and request a full calculation on load |
| §18.3.1.4 | Sparse cells, references, style indexes, formulas, cached values, and standard cell type tags |
| §18.3.1.13, §18.3.1.35, §18.3.1.73 | Column spans/widths, used dimension, row index/height/hidden state |
| §18.3.1.53–55 | Inline rich strings and non-overlapping merged ranges |
| §18.3.1.66, §18.3.1.87–88 | Split/frozen pane state from worksheet views |
| §18.4.8–9, §18.4.12 | Shared string tables, rich runs, significant whitespace, and exclusion of phonetic hints from displayed base text |
| §18.8.1–45 | Stylesheet projection: fonts, fills, borders, colors, alignment, cell/row/column formats, base-style inheritance, apply flags, and number-format records |
| §20.1.4.1.17, §20.1.6.10 | DrawingML major/minor theme font resolution with cached SpreadsheetML font-name fallback |
| §18.18.11 | `b`, `d`, `e`, `inlineStr`, `n`, `s`, and `str` cell types |
| §18.3.1.94–95, §18.5.1.2–3 | Relationship-resolved table parts, ranges, identities, columns, totals metadata, and table style flags |
| §18.3.1.2, §18.3.1.92, §18.3.2.7–10 | Worksheet/table AutoFilter ranges, value/custom criteria, button state, and saved value-sort state |
| MS-XLSX §2.2.2, ECMA-376-1 §18.17.2–7 | Typed formula parsing, references/ranges, bounded dependencies, operators, errors, and the first calculation function set |

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
- apply explicit cell styles ahead of row custom formats and column styles;
- resolve theme fonts and colors while retaining their source identities;
- format common decimals, grouping, percentages, scientific values, fractions,
  dates, and times while retaining raw values and workbook date-system identity;
- stage literal string, finite-number, boolean, and clear operations;
- add missing rows/cells in coordinate order, expand dimensions, save, and reopen;
- invalidate stale calculation chains and request full recalculation after a
  semantic literal edit;
- leave a semantic no-op byte-identical and copy untouched ZIP payloads exactly.
- project table body rows through supported saved or user-selected filters and
  stable value sorts using scalar values and stored formula results;
- enumerate formatted table values for a fully client-side filter menu using
  calculated overlays or stored caches without changing workbook bytes;
- calculate supported ordinary formulas into an immutable overlay, including
  arithmetic/comparison/concatenation, same- and cross-sheet A1 references,
  ranges, `IF`, `SUM`, `COUNT`, `AVERAGE`, `MIN`, `MAX`, `AND`, `OR`, and `NOT`;
- recalculate supported dependants after scalar edits while leaving formula text,
  cached values, calculation metadata, and package bytes source-owned;

Literal text writes use `inlineStr`. This avoids a workbook-wide shared-string
reindex for a local edit. Replacing a formula with a literal intentionally
removes the formula. Existing style and unknown cell attributes/children are
retained inside the rewritten target cell; unrelated worksheet source and
unrelated package parts are not reserialized.

`@tumbler/core` supplies one-based, immutable selection and arrow-navigation
primitives plus sparse variable-axis geometry. `@tumbler/svelte` supplies
`SpreadsheetGrid`, an owned virtualized surface with row/column headers, click
and shift selection, keyboard navigation, styled display, merged cells, frozen
regions, an inline editor, table sort/filter dropdowns, a read-only mode, and
typed selection/edit callbacks. Table controls project source rows into visual
slots; filtered slots collapse through sparse geometry and the source package is
unchanged. Its pure viewport and grid-layout calculators are usable independently
of Svelte.

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

The Svelte head measures the widest decimal digit in the resolved Normal-style
font before applying the standard column-width conversion. Alignment rendering
includes General type-sensitive alignment, vertical position, wrapping,
indentation, reading direction, and rotated or stacked text.

Row geometry preserves explicit point heights and hidden rows. Rows without an
explicit height grow from the effective cell or row font and hard line breaks,
then project onto Excel's integer 96-DPI pixel grid. Width-dependent wrapping
remains a renderer-level fidelity gap.

## Deliberate current limits

- Only ordinary worksheet sheet targets are accepted. Chart sheets, dialog
  sheets, macro sheets, and external sheet targets are diagnosed as unsupported.
- Unsupported DrawingML theme color expressions remain preserved but unresolved;
  the current computed view supports sRGB and system-color fallbacks.
- The number-format interpreter covers the common built-ins and a useful custom
  subset. It does not yet implement the entire conditional, locale/currency,
  elapsed-time, fill-character, and fraction language from §18.8.31.
- Font fallback still depends on fonts installed in the browser environment;
  East Asian and complex-script runs are not yet segmented for per-run theme
  font selection.
- Merges wholly within one scrolling or frozen region render as one cell.
  Merges crossing a frozen-pane boundary still need quadrant clipping.
- Formula calculation is deliberately partial. Ordinary scalar formulas in the
  first grammar/function slice calculate in a bounded overlay; unsupported
  names, structured/external references, shared/array/data-table/dynamic-array
  forms, volatile behavior, iterative calculation, and the wider Excel function
  catalog fall back to producer caches with diagnostics. Formula caches are not
  written, formula text is not editable, and structural row/column edits do not
  exist.
- Table and AutoFilter support is read-only. Value lists and one/two-condition
  custom filters plus vertical value sorting are projected; dynamic, top-10,
  color, icon, and horizontal sorts remain explicitly unsupported and are not
  applied. User table view state is not written back to SpreadsheetML.
- Validations, conditional formats, comments, hyperlinks, drawings, charts,
  pivots, names, and external links are preserved as unknown content but have no
  semantic or visual model.
- Editing an existing rich/shared string replaces that cell's value with a plain
  inline string; run formatting and phonetic annotations are not retained for
  the intentionally replaced value.
- Open XML SDK and LibreOffice validation harnesses now run in compatibility CI.
  Microsoft Excel and Apache POI passes, plus a licensed real-producer corpus,
  have not been recorded yet.

## Next qualification boundary

The next useful slice is real-producer visual qualification, followed by
conditional formatting, richer number formats, and formula/reference modelling.
Before calling the slice interoperable, real-producer fixtures must pass Excel,
LibreOffice, and an independent parser without repair or unexplained semantic
drift.
