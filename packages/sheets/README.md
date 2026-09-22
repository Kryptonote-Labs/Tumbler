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
