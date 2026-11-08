import { expect, test } from 'bun:test';
import { createSpreadsheet, applySpreadsheetCommand, spreadsheetFormatPainterSample, parseCellRange } from '../src/index.ts';
test('painter tiles cell formatting over a range without changing values', () => {
  let a = createSpreadsheet(); const sheetId = String(a.activeSheet.sheetId);
  a = applySpreadsheetCommand(a, { name: 'set-cell', sheetId, reference: 'C3', value: 'Keep me' });
  a = applySpreadsheetCommand(a, { name: 'format-cells', sheetId, range: 'A1', patch: { text: { bold: { set: true } } } });
  a = applySpreadsheetCommand(a, { name: 'set-number-format', sheetId, range: 'A1', format: { code: '0.000' } });
  a = applySpreadsheetCommand(a, { name: 'set-borders', sheetId, range: 'B1', preset: 'all', style: 'double' });
  const styles = spreadsheetFormatPainterSample(a, parseCellRange('A1:B1'));
  a = applySpreadsheetCommand(a, { name: 'paint-formatting', sheetId, range: 'C3:F4', styles });
  expect(a.worksheet.cell('C3')!.value).toMatchObject({ value: 'Keep me' });
  expect(a.worksheet.cellStyle('C3')!.font.bold).toBe(true);
  expect(a.worksheet.cellStyle('E4')!.numberFormatCode).toBe('0.000');
  expect(a.worksheet.cellStyle('D3')!.border.top.style).toBe('double');
  expect(a.worksheet.cellStyle('F4')!.border.top.style).toBe('double');
});

test('whole-sheet sampling keeps defaults and sparse overrides compact', () => {
  let a = createSpreadsheet(); const sheetId = String(a.activeSheet.sheetId);
  a = applySpreadsheetCommand(a, { name: 'format-cells', sheetId, range: 'B2', patch: { text: { bold: { set: true } } } });
  const sample = spreadsheetFormatPainterSample(a, parseCellRange('A1:XFD1048576'));
  expect(sample.regions).toHaveLength(1);
  a = applySpreadsheetCommand(a, { name: 'paint-formatting', sheetId, range: 'C3:D4', styles: sample });
  expect(a.worksheet.cellStyle('D4')!.font.bold).toBe(true);
  expect(a.worksheet.cellStyle('C3')!.font.bold).toBe(false);
});
