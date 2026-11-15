import { coerceSpreadsheetEditValue } from './spreadsheet-edit.ts';

/** Excel-compatible quoted TSV, shared by host and embedded chart data sheets. */
export function parseSpreadsheetClipboard(
  text: string,
  asText: (row: number, column: number) => boolean = () => false,
) {
  const rows: string[][] = [[]];
  let cell = '',
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '"' && (quoted || cell === '')) {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (character === '\t' || character === '\n' || character === '\r')) {
      rows.at(-1)!.push(cell);
      cell = '';
      if (character !== '\t') {
        if (character === '\r' && text[index + 1] === '\n') index++;
        rows.push([]);
      }
    } else cell += character;
  }
  rows.at(-1)!.push(cell);
  if (rows.length > 1 && rows.at(-1)!.length === 1 && rows.at(-1)![0] === '') rows.pop();
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row, rowIndex) =>
    Array.from({ length: width }, (_, column) =>
      coerceSpreadsheetEditValue(row[column] ?? '', undefined, asText(rowIndex, column)),
    ),
  );
}
