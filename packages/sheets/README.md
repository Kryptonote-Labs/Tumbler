# `@tumblerjs/sheets`

Headless SpreadsheetML reading, preservation, calculation, editing, and view
models for browser-based spreadsheet experiences.

> **Extremely early alpha.** Spreadsheet and formula coverage is incomplete,
> APIs can change without notice, and unsupported workbook content may not yet
> survive every edit. Keep original copies of important files.

```sh
bun add @tumblerjs/sheets@alpha
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

Formula source passed to the headless API does not include a leading `=`.
Ordinary formulas are editable; shared, array, data-table, dynamic-array, and
external-workbook formula structures are not yet editable.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
