import type { EditableCellValue, SpreadsheetCell } from "@tumblerjs/sheets";
import { coerceSpreadsheetEditValue } from "./spreadsheet-edit.ts";

export type SpreadsheetFormulaBarEdit =
  | { readonly kind: "formula"; readonly sheet?: string; readonly reference: string; readonly formula: string }
  | { readonly kind: "value"; readonly sheet?: string; readonly reference: string; readonly value: EditableCellValue };

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
  sheet?: string,
  asText = false,
): SpreadsheetFormulaBarEdit {
  const edit: SpreadsheetFormulaBarEdit = draft.startsWith("=") && !asText
    ? { kind: "formula", reference, formula: draft.slice(1) }
    : { kind: "value", reference, value: coerceSpreadsheetEditValue(draft, cell?.value, asText) };
  return sheet === undefined ? edit : Object.freeze({ ...edit, sheet });
}

export interface SpreadsheetFormulaFunctionInsertion {
  readonly draft: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * Replaces the draft selection with `NAME()` and places the caret between the
 * parentheses, ready for arguments or picked references. A draft without a
 * leading equals becomes a formula, so `2*` yields `=2*NAME()`.
 */
export function insertSpreadsheetFormulaFunction(
  draft: string,
  name: string,
  selectionStart: number,
  selectionEnd: number,
): SpreadsheetFormulaFunctionInsertion {
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(name)) throw new TypeError(`"${name}" is not a function name.`);
  const prefix = draft.startsWith("=") ? "" : "=";
  const source = `${prefix}${draft}`;
  const clamp = (offset: number) => Math.min(Math.max(offset + prefix.length, 1), source.length);
  const start = clamp(Math.min(selectionStart, selectionEnd));
  const end = clamp(Math.max(selectionStart, selectionEnd));
  const caret = start + name.length + 1;
  return Object.freeze({
    draft: `${source.slice(0, start)}${name}()${source.slice(end)}`,
    selectionStart: caret,
    selectionEnd: caret,
  });
}
