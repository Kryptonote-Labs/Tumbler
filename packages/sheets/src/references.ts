export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLUMNS = 16_384;

export interface CellAddress {
  /** One-based row number, as represented by SpreadsheetML. */
  readonly row: number;
  /** One-based column number, where A is 1 and XFD is 16384. */
  readonly column: number;
}

const CELL_REFERENCE = /^([A-Za-z]{1,3})([1-9][0-9]{0,6})$/;

export function parseCellReference(reference: string): CellAddress {
  const match = CELL_REFERENCE.exec(reference);
  if (match === null) {
    throw new RangeError(`${JSON.stringify(reference)} is not an A1 cell reference.`);
  }
  const letters = match[1];
  const digits = match[2];
  if (letters === undefined || digits === undefined) {
    throw new RangeError(`${JSON.stringify(reference)} is not an A1 cell reference.`);
  }
  let column = 0;
  for (const letter of letters.toUpperCase()) {
    column = column * 26 + letter.charCodeAt(0) - 64;
  }
  const row = Number(digits);
  if (column > EXCEL_MAX_COLUMNS || row > EXCEL_MAX_ROWS) {
    throw new RangeError(`${JSON.stringify(reference)} is outside the worksheet grid.`);
  }
  return Object.freeze({ row, column });
}

export function formatCellReference(address: CellAddress): string {
  assertGridCoordinate(address.row, EXCEL_MAX_ROWS, "row");
  assertGridCoordinate(address.column, EXCEL_MAX_COLUMNS, "column");
  let column = address.column;
  let letters = "";
  while (column > 0) {
    column -= 1;
    letters = String.fromCharCode(65 + column % 26) + letters;
    column = Math.floor(column / 26);
  }
  return `${letters}${address.row}`;
}

function assertGridCoordinate(value: number, maximum: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 1 through ${maximum}.`);
  }
}
