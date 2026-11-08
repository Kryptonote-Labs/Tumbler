# `@tumblerjs/sheets`

Headless SpreadsheetML reading, preservation, calculation, editing, and view
models for browser-based spreadsheet experiences.

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

`applySpreadsheetCommand` supports `insert-shape` with optional text, `insert-image` with base64 data and a content type, `move-drawing` with pixel bounds, `style-drawing`, `align-drawing` to a cell range, `order-drawing`, `duplicate-drawing` and `delete-drawing`. These commands also apply to imported chart placement; chart creation is not provided. CLI sheet reads include drawing IDs and bounds, and the same command schemas drive the CLI and interactive editor.
