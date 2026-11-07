import { spreadsheetNumberFormatState, type SpreadsheetWorksheet, type EditableCellValue, type SpreadsheetCellValue } from "@tumblerjs/sheets";

export interface SpreadsheetGridEdit {
  readonly reference: string;
  readonly value: EditableCellValue;
  /** An explicit value keeps leading equals signs literal, for cells formatted as Text. */
  readonly kind?: "value" | "formula";
}

export function spreadsheetCellUsesTextFormat(worksheet: SpreadsheetWorksheet, reference: string): boolean {
  const state = spreadsheetNumberFormatState(worksheet, reference);
  return (state.state === "value" || state.state === "inherited") && state.value.category === "text";
}

/** Interprets editor text using the existing cell type and spreadsheet-like scalar entry rules. */
export function coerceSpreadsheetEditValue(draft: string, current: SpreadsheetCellValue | undefined, asText = false): EditableCellValue {
  if (draft === "") return null;
  if (asText) return draft;
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
