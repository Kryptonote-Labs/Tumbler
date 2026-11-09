import { expect, test } from 'bun:test';
import { applySpreadsheetCommand, createSpreadsheet } from '../src/index.ts';

test('range entry into Text-formatted cells preserves literal numbers and equals signs', () => {
  const formatted = applySpreadsheetCommand(createSpreadsheet(), { name: 'set-number-format', sheetId: '1', range: 'A1:B1', format: 'text' });
  const pasted = applySpreadsheetCommand(formatted, { name: 'set-range', sheetId: '1', reference: 'A1', values: [['001', '=literal']] });
  expect(pasted.worksheet.cell('A1')?.value).toMatchObject({ type: 'string', value: '001' });
  expect(pasted.worksheet.cell('B1')?.value).toMatchObject({ type: 'string', value: '=literal' });
  expect(pasted.worksheet.cell('B1')?.formula).toBeUndefined();
});
