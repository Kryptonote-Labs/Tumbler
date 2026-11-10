import { expect, test } from 'bun:test';
import {
  EXCEL_MAX_ROWS,
  SpreadsheetWorksheet,
  SpreadsheetStyles,
  createSpreadsheet,
  applySpreadsheetCommand,
  projectSpreadsheetConditionalStyles,
} from '../src/index.ts';

test('merged ranges stay sparse and retain exact boundaries across distant row queries', () => {
  const artifact = createSpreadsheet();
  const tall = { start: { row: 1, column: 3 }, end: { row: EXCEL_MAX_ROWS, column: 4 } };
  const small = { start: { row: 3, column: 1 }, end: { row: 4, column: 2 } };
  const sheet = new SpreadsheetWorksheet({ ...artifact.worksheet, merges: [tall, small] });
  for (let row = 1; row <= 600; row++) expect(sheet.mergedRange({ row, column: 3 })).toBe(tall);
  expect(sheet.mergedRange({ row: EXCEL_MAX_ROWS, column: 4 })).toBe(tall);
  expect(sheet.mergedRange('A3')).toBe(small);
  expect(sheet.mergedRange('B4')).toBe(small);
  expect(sheet.mergedRange('A5')).toBeUndefined();
  expect(sheet.mergedRange('E1')).toBeUndefined();
  expect(sheet.mergedRange('C1')).toBe(tall);
});

test('conditional range indexing keeps the first sqref origin and global rule priority', () => {
  const artifact = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-range',
    sheetId: '1',
    reference: 'A1',
    values: [
      [10, 0, 0, 0],
      [5, 0, -1, 0],
    ],
  });
  const styles = new SpreadsheetStyles({
    fonts: artifact.worksheet.styles.fonts,
    fills: artifact.worksheet.styles.fills,
    borders: artifact.worksheet.styles.borders,
    cellFormats: artifact.worksheet.styles.cellFormats,
    differentialFormats: [
      { font: { bold: true }, fill: undefined, border: undefined },
      { font: { italic: true }, fill: undefined, border: undefined },
    ],
  });
  const sheet = new SpreadsheetWorksheet({
    ...artifact.worksheet,
    styles,
    conditionalFormatting: [
      {
        pivot: false,
        ranges: [
          { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
          { start: { row: 2, column: 4 }, end: { row: 2, column: 4 } },
        ],
        rules: [
          {
            kind: 'expression',
            formula: 'A1>0',
            priority: 1,
            stopIfTrue: false,
            differentialFormatId: 0,
            sourceOrder: 0,
          },
          {
            kind: 'expression',
            formula: '$A1>0',
            priority: 2,
            stopIfTrue: false,
            differentialFormatId: 1,
            sourceOrder: 1,
          },
        ],
      },
    ],
  });
  const projection = projectSpreadsheetConditionalStyles(sheet);
  expect(projection.formats('B1')).toEqual([
    styles.differentialFormats[1]!,
    styles.differentialFormats[0]!,
  ]);
  expect(projection.formats('D2')).toEqual([styles.differentialFormats[1]!]);
  expect(projection.formats('B2')).toEqual([]);
  expect(projection.formats('D1')).toEqual([]);
});
