import { formatCellRange, type CellRange } from "@tumblerjs/sheets";

export interface SpreadsheetFormulaReferencePick {
  /** Monotonic host identity so repeatedly picking the same range remains observable. */
  readonly id: number;
  readonly sheet: string;
  readonly range: CellRange;
}

export interface SpreadsheetFormulaTextSpan {
  readonly start: number;
  readonly end: number;
}

export interface SpreadsheetFormulaReferenceInsertion {
  readonly draft: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly insertedSpan: SpreadsheetFormulaTextSpan;
}

/** Formats an internal A1 reference, qualifying it only when it crosses worksheets. */
export function spreadsheetFormulaReferenceText(
  pick: Pick<SpreadsheetFormulaReferencePick, "sheet" | "range">,
  targetSheet: string,
): string {
  const reference = formatCellRange(pick.range);
  return pick.sheet.toLocaleLowerCase() === targetSheet.toLocaleLowerCase()
    ? reference
    : `${formulaSheetName(pick.sheet)}!${reference}`;
}

/**
 * Inserts a picked reference at the formula-bar selection. Passing the previous
 * inserted span makes pointer-drag range updates replace the in-progress pick.
 */
export function insertSpreadsheetFormulaReference(
  draft: string,
  reference: string,
  selectionStart: number,
  selectionEnd: number,
  previousInsertedSpan?: SpreadsheetFormulaTextSpan,
): SpreadsheetFormulaReferenceInsertion {
  const selection = normalizeSpan(draft, { start: selectionStart, end: selectionEnd });
  const replacement = previousInsertedSpan === undefined ? selection : normalizeSpan(draft, previousInsertedSpan);
  const nextDraft = `${draft.slice(0, replacement.start)}${reference}${draft.slice(replacement.end)}`;
  const end = replacement.start + reference.length;
  return Object.freeze({
    draft: nextDraft,
    selectionStart: end,
    selectionEnd: end,
    insertedSpan: Object.freeze({ start: replacement.start, end }),
  });
}

function formulaSheetName(name: string): string {
  if (canRemainUnquoted(name)) return name;
  return `'${name.replaceAll("'", "''")}'`;
}

function canRemainUnquoted(name: string): boolean {
  return /^[A-Za-z_\\][A-Za-z0-9_.]*$/u.test(name) &&
    !/^(?:TRUE|FALSE)$/iu.test(name) &&
    !isBoundedCellReference(name);
}

function isBoundedCellReference(value: string): boolean {
  const match = /^([A-Za-z]{1,3})([1-9][0-9]*)$/u.exec(value);
  if (match === null) return false;
  let column = 0;
  for (const character of match[1]!.toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  return column <= 16_384 && Number(match[2]) <= 1_048_576;
}

function normalizeSpan(source: string, span: SpreadsheetFormulaTextSpan): SpreadsheetFormulaTextSpan {
  if (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end)) {
    throw new TypeError("Formula text selections must use integer offsets.");
  }
  const start = Math.min(span.start, span.end);
  const end = Math.max(span.start, span.end);
  if (start < 0 || end > source.length) throw new RangeError("Formula text selection is outside the draft.");
  return { start, end };
}
