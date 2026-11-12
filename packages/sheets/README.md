# `@tumblerjs/sheets`

Headless SpreadsheetML reading, preservation, calculation, editing, and view
models for browser-based spreadsheet experiences.

This package exports TypeScript source. Use ES2024 library typings, including
`DOM` and `DOM.Iterable`, with a bundler that handles `.ts` imports. Your output
`target` can remain ES2022; `lib` adds typings, not runtime polyfills. See the
[consumer configuration and runtime API requirements](https://github.com/Kryptonote-Labs/Tumbler#typescript-and-runtime-requirements).

> **Extremely early alpha.** Spreadsheet and formula coverage is incomplete,
> APIs can change without notice, and unsupported workbook content may not yet
> survive every edit. Keep original copies of important files.

```sh
bun add @tumblerjs/sheets
```

```ts
import { openSpreadsheetArtifact } from "@tumblerjs/sheets";

const artifact = openSpreadsheetArtifact(bytes);
console.log(artifact.workbook.sheets);
```

Read formula source and Tumbler's calculated display separately:

```ts
console.log(artifact.worksheet.cell("C7")?.formula);
console.log(artifact.calculation.displayText("C7"));
```

Supported conditional aggregates can read same- or cross-sheet ranges and are
recalculated after source edits:

```ts
const edited = artifact
  .editFormula("D7", `SUMIF('Input Data'!A2:A20,">0",'Input Data'!B2)`)
  .editCellOnSheet("Input Data", "A2", 4);

console.log(edited.calculation.displayText("D7"));
```

Edits return a fresh artifact with recalculated supported dependants:

```ts
const edited = artifact
  .editCell("A1", 8)
  .editFormula("C7", "SUM(C5:C6)");

const output = edited.bytes();
```

Apply semantic formatting without exposing SpreadsheetML style indexes:

```ts
const formatted = edited.applyFormatting("B4:D12", {
  text: {
    fontSize: { set: 14 },
    bold: { set: true },
    italic: { set: false },
    underline: { set: "single" },
    color: { set: { type: "rgb", value: "#C62828" } },
  },
  block: { horizontalAlignment: { set: "center" } },
});

console.log(formatted.formattingState("B4:D12"));
```

Formatting is immutable, applies to values and blank cells, preserves unrelated
number/fill/border properties, and deduplicates equivalent styles.

Project conditional formatting without materializing its ranges:

```ts
import { projectSpreadsheetConditionalStyles } from "@tumblerjs/sheets";

const conditional = projectSpreadsheetConditionalStyles(
  artifact.worksheet,
  artifact.calculation,
);
const differentialFormats = conditional.formats("B7");
console.log(conditional.diagnostics);
```

The first read-only slice supports `cellIs` comparisons and expressions that
the bounded formula engine can evaluate. It resolves incremental font, solid
fill, and border formatting with priority and `stopIfTrue`. Unsupported rule
kinds remain inert and produce diagnostics when queried.

Formula source passed to the headless API does not include a leading `=`.
Ordinary formulas are editable; shared, array, data-table, dynamic-array, and
external-workbook formula structures are not yet editable.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).

## Native editing and commands

`createSpreadsheet()` starts an editable workbook. `applySpreadsheetCommand()`
validates cell, formula, range, formatting, worksheet, row, column, merge, and
freeze actions through the exported `spreadsheetCommand` schema. Worksheet
handles are decimal `sheetId` strings; names are also accepted. The `nameValue`
field names new or renamed worksheets. `inspectSpreadsheet()` returns populated
cells, formula sources, calculated values, and formatted display text for a
requested worksheet range.

Spreadsheet artifacts edit native OPC member resources. Cell edits, formatting,
and structural actions do not serialize or compress an XLSX. Call `bytes()` only
when exporting XLSX. `createSpreadsheetNativeArchive()` separates the native
manifest and immutable binary resources so hosts can deduplicate them in SQLite
or object storage. `encodeSpreadsheetNativeArchive()` frames those resources for
transport, and `openSpreadsheetArtifact()` accepts either that native transport
or an XLSX upload. A native conversion preserves an untouched upload's original
XLSX bytes, including unrecognized package parts.

Worksheet renames update formulas, named ranges, chart references, and validation
formulas. Deleting a referenced worksheet writes `#REF!` formulas. Formula string
literals and external workbook references retain their original text.

Worksheet drawings retain their original XML, relationships and media when cells are edited. `readSpreadsheetDrawingObjects` projects imported shapes, pictures, text and groups for grid rendering. `spreadsheetDrawingObjectId` reads the stable, sheet-local DrawingML object identity. Drawing commands use that `objectId`, not XML parser node IDs.

`applySpreadsheetCommand` supports `insert-shape` with optional text, `insert-image` with base64 data and a content type, `move-drawing` with pixel bounds, `style-drawing`, `align-drawing` to a cell range, `order-drawing`, `duplicate-drawing` and `delete-drawing`. These commands also apply to imported chart placement; shared chart content commands provide chart creation and data editing. CLI sheet reads include drawing IDs and bounds, and the same command schemas drive the CLI and interactive editor.

Spreadsheet interaction commands include `replace-text` with literal, case-sensitive and whole-word search options, `set-sheet-state` for hide and unhide, and `set-tab-color` for RGB colours or removal. Replacement edits cell source, including formulas, rather than calculated results. Hiding the last visible sheet is rejected. `SpreadsheetGrid` follows the sheet view's gridline setting unless the host passes `showGridlines`, and can toggle `showHeadings`; row and column headers expose their source indices for host menus.

### Headless rendering

`layoutSpreadsheetViewport(worksheet, { width, height })` lays out the worksheet as the editor first shows it: from the saved scroll position, with frozen panes, hidden rows and columns, merged cells, text spill, conditional formats, shapes, pictures and charts. Pass `calculation` to show calculated values and `headings` to include row and column headings. The layout is plain data with no workbook references, so it can be transferred to a worker. There, `paintSpreadsheetViewport(context, layout, { path })` paints it into any Canvas 2D context. Decode `spreadsheetViewportImages(layout)` first and return them from the `image` option. The editor grid paints its cells with the same `paintSpreadsheetCell`.

### Printing

`spreadsheetPrintPages(artifact)` paginates the active worksheet in CSS pixels. It reads saved print areas and repeated title rows/columns, paper size and orientation, margins, scale or fit-to-page, manual breaks, page order, gridlines, headings and centering. The Svelte `SpreadsheetPrintView` renders these pages with calculated values, cell formatting and supported charts. `PresentationPrintView` from `@tumblerjs/svelte/slides` renders one page per slide using the existing slide renderer. Hosts mount the views before invoking their browser print dialog, which also supports saving PDF.

Header/footer text fields are rendered as plain text. Printer-specific settings and header/footer font runs are retained in the file but do not control browser output. Paper codes outside the supported standard sizes require explicit paper dimensions.

## Format painter

`spreadsheetFormatPainterSample(artifact, range)` captures workbook style defaults and sparse overrides for
a source rectangle. Apply them with `paint-formatting`, providing `sheetId`, a destination
`range`, and the captured `styles` sample. Formatting repeats across the destination
without changing values or formulas. Samples belong to their source workbook and
include number formats, borders, fills and alignment.

`inspectSpreadsheet` and CLI `sheets read` include `formattingSample` for the requested
range. Pass that object unchanged as `styles` to `paint-formatting` in the same workbook.
