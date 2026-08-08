import type { EditableCellValue, SpreadsheetCell } from "@tumblerjs/sheets";
import { coerceSpreadsheetEditValue } from "./spreadsheet-edit.ts";

export type SpreadsheetFormulaBarEdit =
  | { readonly kind: "formula"; readonly reference: string; readonly formula: string }
  | { readonly kind: "value"; readonly reference: string; readonly value: EditableCellValue };

/** Presents stored formula source with the UI-only equals prefix used by spreadsheet formula bars. */
export function spreadsheetFormulaBarText(cell: SpreadsheetCell | undefined): string {
  if (cell?.formula !== undefined) return `=${cell.formula}`;
  const value = cell?.value;
  if (value === undefined || value.type === "blank") return "";
  if (value.type === "boolean") return value.value ? "TRUE" : "FALSE";
  if (value.type === "number") return value.lexical;
  return value.value;
}

/** The explicit formula bar is the only Tumbler editor that interprets a leading equals sign. */
export function spreadsheetFormulaBarEdit(
  reference: string,
  draft: string,
  cell: SpreadsheetCell | undefined,
): SpreadsheetFormulaBarEdit {
  return draft.startsWith("=")
    ? { kind: "formula", reference, formula: draft.slice(1) }
    : { kind: "value", reference, value: coerceSpreadsheetEditValue(draft, cell?.value) };
}
