import type { EditableCellValue, SpreadsheetCellValue } from "@tumblerjs/sheets";

export interface SpreadsheetGridEdit {
  readonly reference: string;
  readonly value: EditableCellValue;
}

/** Interprets editor text using the existing cell type and spreadsheet-like scalar entry rules. */
export function coerceSpreadsheetEditValue(draft: string, current: SpreadsheetCellValue | undefined): EditableCellValue {
  if (current?.type === "string" || current?.type === "date" || current?.type === "error") return draft;
  const normalized = draft.trim();
  if (current?.type === "boolean" || current === undefined || current.type === "blank") {
    if (/^(?:true|false)$/i.test(normalized)) return normalized.toLowerCase() === "true";
  }
  if (current?.type === "number" || current === undefined || current.type === "blank") {
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
      const value = Number(normalized);
      if (Number.isFinite(value)) return value;
    }
  }
  return draft;
}
