import { expect, test } from 'bun:test';
import { encodeXmlSource } from '@tumblerjs/ooxml';
import { applySpreadsheetCommand, createSpreadsheet, inspectSpreadsheet, openSpreadsheetArtifact, createSpreadsheetNativeArchive, openSpreadsheetNativeArchive } from '../src/index.ts';

const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function workbook(rows: string, encoding: 'utf-8' | 'utf-16le' = 'utf-8') {
  return createSpreadsheet().workbook.package.archive.withChanges({ replacements: new Map([
    ['xl/worksheets/sheet1.xml', encodeXmlSource(`<worksheet xmlns="${namespace}"><sheetData>${rows}</sheetData></worksheet>`, encoding, encoding !== 'utf-8')],
  ]) }).originalBytes();
}

test('row-wise reading preserves cached values, formulas, source bytes and later edits', () => {
  const bytes = workbook('<row r="1"><c r="A1"><v>7</v></c><c r="B1"><f>A1*2</f><v>14</v></c></row><row><c t="inlineStr"><is><t>second &amp; row</t></is></c></row>', 'utf-16le');
  const artifact = openSpreadsheetArtifact(bytes);
  expect(artifact.worksheet.document.isParsed).toBe(false);
  expect(artifact.worksheet.displayText('B1')).toBe('14');
  expect(artifact.worksheet.cell('B1')?.formula).toBe('A1*2');
  expect(artifact.worksheet.cell('A2')?.value).toMatchObject({value: 'second & row'});
  expect(artifact.worksheet.document.isParsed).toBe(false);
  const restored = openSpreadsheetNativeArchive(createSpreadsheetNativeArchive(artifact));
  expect(restored.bytes()).toEqual(bytes);
  const edited = applySpreadsheetCommand(restored, {name: 'set-cell', sheetId: '1', reference: 'A1', value: 9});
  expect(inspectSpreadsheet(edited).cells.find(cell => cell.reference === 'B1')?.computed).toMatchObject({value: 18});
});

for (const [name, rows] of [
  ['duplicate rows', '<row r="1"/><row r="1"/>'],
  ['duplicate cells', '<row><c r="A1"/><c r="A1"/></row>'],
  ['invalid values in a later row', '<row r="100"><c r="A100"><v>nope</v></c></row>'],
  ['malformed XML', '<row><c></row>'],
] as const) test(`row-wise reading rejects ${name}`, () => {
  expect(() => openSpreadsheetArtifact(workbook(rows))).toThrow();
});

test('formula snapshots calculate on access and preserve a stable result for an immutable artifact', () => {
  const artifact = openSpreadsheetArtifact(workbook('<row><c><f>1+2</f><v>99</v></c></row>'));
  expect(artifact.worksheet.displayText('A1')).toBe('99');
  const calculation = artifact.calculation;
  expect(calculation.displayText('A1')).toBe('3');
  expect(artifact.calculation).toBe(calculation);
  expect(artifact.worksheet.displayText('A1')).toBe('99');
});
