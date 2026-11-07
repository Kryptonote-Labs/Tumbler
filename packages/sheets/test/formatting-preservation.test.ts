import { expect, test } from 'bun:test';
import { adjustSpreadsheetNumberFormatDecimals, applySpreadsheetCommand, createSpreadsheet, openSpreadsheetArtifact } from '../src/index.ts';
import { buildWorkbookFixture } from './workbook-fixture.ts';
import { DEFAULT_OFFICE_THEME } from '@tumblerjs/ooxml';

test('border changes retain distinct uploaded gradient fills', () => {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const original = openSpreadsheetArtifact(buildWorkbookFixture({
    stylesXml: `<styleSheet xmlns="${ns}"><fonts count="1"><font><sz val="11"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill>${['FF0000FF', 'FFFF0000'].map(rgb => `<fill><gradientFill><stop position="0"><color rgb="${rgb}"/></stop><stop position="1"><color rgb="FFFFFFFF"/></stop></gradientFill></fill>`).join('')}</fills><borders count="1"><border/></borders><cellXfs count="3">${[0,1,2].map(fillId => `<xf fontId="0" fillId="${fillId}" borderId="0" numFmtId="0"/>`).join('')}</cellXfs></styleSheet>`,
    sheets: [{ name: 'Data', sheetId: 1, relationshipId: 'data', xml: `<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="2"><v>2</v></c></row></sheetData></worksheet>` }],
  }));
  const formatted = applySpreadsheetCommand(original, { name: 'set-borders', sheetId: '1', range: 'A1:B1', preset: 'all' });
  for (const artifact of [formatted, openSpreadsheetArtifact(formatted.bytes())]) {
    expect(artifact.worksheet.cellStyle('A1').fill).toBe(artifact.worksheet.styles.fills[1]!);
    expect(artifact.worksheet.cellStyle('B1').fill).toBe(artifact.worksheet.styles.fills[2]!);
    expect(artifact.formattingState('A1').cell?.fill).toEqual({ state: 'unavailable' });
  }
});

test('decimal adjustment recognizes a point before the first digit', () => {
  expect(adjustSpreadsheetNumberFormatDecimals('.00', 'increase')).toBe('.000');
  expect(adjustSpreadsheetNumberFormatDecimals('.00', 'decrease')).toBe('.0');
  expect(adjustSpreadsheetNumberFormatDecimals('.##', 'increase')).toBe('.##0');
  expect(adjustSpreadsheetNumberFormatDecimals('.##', 'decrease')).toBe('.#');
  expect(adjustSpreadsheetNumberFormatDecimals('.0', 'decrease')).toBe('0');
  expect(adjustSpreadsheetNumberFormatDecimals('.#', 'decrease')).toBe('0');
  expect(adjustSpreadsheetNumberFormatDecimals('.0" kg"', 'decrease')).toBe('0" kg"');
});

test('borders on a whole-column merge stay sparse', () => {
  const merged = applySpreadsheetCommand(createSpreadsheet(), { name: 'merge-cells', sheetId: '1', range: 'B1:B1048576' });
  const formatted = applySpreadsheetCommand(merged, { name: 'set-borders', sheetId: '1', range: 'B1:B1048576', preset: 'outside' });
  expect(formatted.worksheet.rows.length).toBeLessThan(4);
  expect(formatted.worksheet.rows.flatMap(row => row.cells).length).toBeLessThan(4);
  expect(formatted.worksheet.cellStyle('B500000').border).toMatchObject({ left: { style: 'thin' }, right: { style: 'thin' } });
  expect(formatted.worksheet.cellStyle('B1').border).toMatchObject({ top: { style: 'thin' }, bottom: { style: 'thin' } });
});

test('new theme colours carry their workbook theme through export', () => {
  const formatted = applySpreadsheetCommand(createSpreadsheet(), { name: 'format-cells', sheetId: '1', range: 'A1', patch: { cell: { fill: { set: { type: 'solid', color: { type: 'theme', slot: 'accent1' } } } } } });
  for (const artifact of [formatted, openSpreadsheetArtifact(formatted.bytes())]) {
    expect(artifact.worksheet.styles.theme?.color('accent1')).toBe(DEFAULT_OFFICE_THEME.color('accent1'));
    expect(artifact.worksheet.styles.resolveColor(artifact.worksheet.cellStyle('A1').fill.foreground)).toBe(`FF${DEFAULT_OFFICE_THEME.color('accent1')}`);
  }
});
