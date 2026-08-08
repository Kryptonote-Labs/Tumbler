# Tumbler

Headless Office document editing for the web, with optional UI heads that remain
entirely under application control.

> [!CAUTION]
> **Tumbler is extremely early alpha software. You probably should not use it.**
>
> APIs, package boundaries, and file-format behavior can change without notice.
> Compatibility with real-world Office documents is incomplete, and unsupported
> content may not survive every edit. Keep original copies of important files.

Tumbler reads and edits OOXML packages directly in the browser. It does not
convert documents to PDF, depend on a hosted Office editor, or impose an
application shell. The headless packages own document semantics; optional Svelte
components provide replaceable document surfaces.

## What works today

The implemented format is SpreadsheetML (`.xlsx`). The current alpha can:

- open Strict and Transitional workbooks without assuming conventional part paths;
- read worksheets, sparse cells, formulas, styles, dimensions, merges, frozen
  panes, tables, hyperlinks, drawings, and a bounded chart subset;
- calculate a bounded formula subset including ordinary A1 references, ranges,
  arithmetic, comparisons, `IF`, `SUM`, `COUNT`, `AVERAGE`, `MIN`, `MAX`, `AND`,
  `OR`, and `NOT`;
- edit literal strings, numbers, booleans, blank cells, and ordinary formulas;
- save surgical worksheet changes while retaining untouched ZIP payloads;
- render an owned virtualized Svelte grid, formula bar, table views, hyperlinks,
  and native SVG chart previews.

WordprocessingML and PresentationML editing are not implemented yet. Spreadsheet
formula coverage, structural editing, conditional formatting, validations,
comments, pivots, and broad chart fidelity remain incomplete.

## Install

Public packages use the explicit `alpha` npm tag:

```sh
bun add @tumblerjs/sheets@alpha
```

For the optional Svelte head:

```sh
bun add @tumblerjs/svelte@alpha @tumblerjs/sheets@alpha
```

## Load a workbook

`SpreadsheetArtifact` is the simplest browser/application boundary. It keeps the
workbook bytes, selected sheet, parsed worksheet, and calculated-value overlay
together.

```ts
import { openSpreadsheetArtifact } from "@tumblerjs/sheets";

const bytes = new Uint8Array(await file.arrayBuffer());
let artifact = openSpreadsheetArtifact(bytes);

console.log(artifact.workbook.sheets.map((sheet) => sheet.name));
console.log(artifact.activeSheet.name);
console.log(artifact.worksheet.cell("A1"));
```

Select a different worksheet without coupling it to application-specific UI:

```ts
artifact = artifact.selectSheet("Budget");
```

## Read values and calculated results

Formula source, producer-cached values, and Tumbler-calculated values remain
separate:

```ts
const cell = artifact.worksheet.cell("C7");

console.log(cell?.formula);                     // "SUM(C5:C6)"
console.log(cell?.value);                       // value stored by the producer
console.log(artifact.calculation.value("C7"));  // Tumbler's calculated value
console.log(artifact.calculation.displayText("C7"));
```

Unsupported formulas retain their source and cached value while exposing a
diagnostic instead of pretending they were calculated.

## Edit cells

Artifact edits are immutable. Each successful edit returns a fresh artifact and
fresh calculation overlay:

```ts
artifact = artifact.editCell("A1", "Hello");
artifact = artifact.editCell("B1", 42);
artifact = artifact.editCell("C1", true);
artifact = artifact.editCell("D1", null); // clear the value
```

Strings are written as inline strings so a local edit does not require rewriting
the workbook-wide Shared String Table.

For a transaction containing several edits:

```sh
bun add @tumblerjs/sheets@alpha @tumblerjs/opc@alpha
```

```ts
import { beginSpreadsheetEdit, openSpreadsheet } from "@tumblerjs/sheets";
import { openOpcPackage } from "@tumblerjs/opc";

const workbook = openSpreadsheet(openOpcPackage(bytes));
const sheet = workbook.sheet("Inputs")!;
const editedBytes = beginSpreadsheetEdit(workbook)
  .setCellValue(sheet, "B2", 8)
  .setCellValue(sheet, "B3", 14)
  .commit();
```

## Edit formulas

The headless API accepts stored OOXML formula source without the UI-only leading
equals sign:

```ts
artifact = artifact.editFormula("C7", "SUM(C5:C6)");

console.log(artifact.worksheet.cell("C7")?.formula); // "SUM(C5:C6)"
console.log(artifact.calculation.displayText("C7")); // immediate local result
```

Or as part of a transaction:

```ts
const editedBytes = beginSpreadsheetEdit(workbook)
  .setCellFormula(sheet, "C7", "SUM(C5:C6)")
  .commit();
```

Ordinary formulas in the supported grammar can be written. Shared, array,
data-table, dynamic-array, and external-workbook formulas are deliberately
rejected rather than flattened or corrupted. Saving removes stale calculation
chains and asks external consumers to perform a full recalculation.

## Save or download

```ts
const output = artifact.bytes();
const blob = new Blob([output], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const url = URL.createObjectURL(blob);
```

No-op edits return the original bytes. Changed parts are written through an
atomic OPC transaction while unrelated compressed payloads remain untouched.

## Svelte grid and formula bar

The formula bar is explicit by design. Inline grid editing always produces
literal values—even when text begins with `=`. Only the formula bar interprets a
leading `=` as formula input.

```svelte
<script lang="ts">
  import { formatCellReference, openSpreadsheetArtifact } from "@tumblerjs/sheets";
  import {
    SpreadsheetFormulaBar,
    SpreadsheetGrid,
    type SpreadsheetFormulaBarEdit,
    type SpreadsheetGridEdit,
  } from "@tumblerjs/svelte";

  let artifact = $state(openSpreadsheetArtifact(bytes));
  let selectedReference = $state("A1");

  function editCell(edit: SpreadsheetGridEdit) {
    artifact = artifact.editCell(edit.reference, edit.value);
  }

  function editFormulaBar(edit: SpreadsheetFormulaBarEdit) {
    artifact = edit.kind === "formula"
      ? artifact.editFormula(edit.reference, edit.formula)
      : artifact.editCell(edit.reference, edit.value);
  }
</script>

<SpreadsheetFormulaBar
  worksheet={artifact.worksheet}
  reference={selectedReference}
  onedit={editFormulaBar}
/>
<SpreadsheetGrid
  worksheet={artifact.worksheet}
  calculation={artifact.calculation}
  onedit={editCell}
  onselectionchange={(selection) => {
    selectedReference = formatCellReference(selection.focus);
  }}
/>
```

Applications own placement, surrounding controls, persistence, navigation, and
theme variables. Neither component requires a hosted service.

## Packages

| Package | Responsibility |
| --- | --- |
| `@tumblerjs/opc` | ZIP package parts, content types, relationships, and atomic writes |
| `@tumblerjs/ooxml` | Loss-aware XML, namespaces, compatibility, themes, and shared metadata |
| `@tumblerjs/formulas` | Headless spreadsheet formula parsing and bounded calculation |
| `@tumblerjs/charts` | Headless DrawingML chart semantics and deterministic layout |
| `@tumblerjs/core` | Format-neutral grid selection and sparse geometry primitives |
| `@tumblerjs/sheets` | SpreadsheetML reading, calculation, preservation, and editing |
| `@tumblerjs/svelte` | Replaceable Svelte document heads |

`word`, `slides`, and `testkit` remain private workspaces while their public
boundaries are unfinished.

## Develop

```sh
bun install
bun run check
bun test
```

`bun run release:qualify` packs every public package and tests the exact package
contents against a local Kryptonote checkout. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the resumable alpha release workflow.

## Engineering documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Formats and UI](docs/formats-and-ui.md)
- [Standards and compatibility](docs/standards-and-compatibility.md)
- [SpreadsheetML implementation status](docs/spreadsheetml-implementation.md)
- [Testing](docs/testing.md)
- [Roadmap](docs/roadmap.md)
- [OOXML engineering reference](docs/reference/README.md)

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and report
security issues according to [SECURITY.md](SECURITY.md).

Tumbler is available under the [MIT License](LICENSE).
