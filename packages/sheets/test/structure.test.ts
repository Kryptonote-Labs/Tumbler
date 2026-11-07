import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import {
  applySpreadsheetCommand,
  createSpreadsheet,
  inspectSpreadsheet,
  openSpreadsheet,
  SpreadsheetArtifact,
  rebaseSpreadsheetFormula,
  type SpreadsheetStructureCommand,
} from '../src/index.ts';

const rows = (
  name: SpreadsheetStructureCommand['name'],
  index: number,
  count = 1,
): SpreadsheetStructureCommand => ({ name, sheetId: '1', index, count });

test('structural formula edits rebase absolute and cross-sheet references without touching strings or parentheses', () => {
  expect(
    rebaseSpreadsheetFormula(
      'SUM($A$1:A10)+Other!A4+"A4"+(A4)',
      'Main',
      'Main',
      rows('insert-rows', 4, 2),
    ),
  ).toBe('SUM($A$1:A12)+Other!A4+"A4"+(A6)');
  expect(
    rebaseSpreadsheetFormula(
      "('Sales data'!$B$5)+B5",
      'Other',
      'Sales data',
      rows('delete-rows', 3, 3),
    ),
  ).toBe('(#REF!)+B5');
  expect(rebaseSpreadsheetFormula('SUM(A2:A8)', 'Main', 'Main', rows('delete-rows', 4, 3))).toBe(
    'SUM(A2:A5)',
  );
  expect(rebaseSpreadsheetFormula('SUM(A4:A5)', 'Main', 'Main', rows('delete-rows', 3, 3))).toBe(
    'SUM(#REF!)',
  );
  expect(
    rebaseSpreadsheetFormula('SUM(A1:C2)+$D$3', 'Main', 'Main', rows('insert-columns', 2, 2)),
  ).toBe('SUM(A1:E2)+$F$3');
  expect(rebaseSpreadsheetFormula('SUM(A1:XFD1)', 'Main', 'Main', rows('insert-columns', 2))).toBe(
    'SUM(A1:XFD1)',
  );
});

test('row insertion and deletion preserve data types, styles, merges, metadata and references on other sheets', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'batch',
    commands: [
      {
        name: 'set-range',
        sheetId: '1',
        reference: 'A1',
        values: [
          [2, true],
          [3, 'text'],
        ],
      },
      { name: 'set-formula', sheetId: '1', reference: 'C2', formula: 'SUM($A$1:A2)' },
      { name: 'add-sheet', nameValue: 'Other' },
      { name: 'set-formula', sheetId: '2', reference: 'A1', formula: 'Sheet1!A2' },
    ],
  });
  artifact = replaceSheet(artifact, (source) =>
    source.replace(
      '</worksheet>',
      '<mergeCells count="1"><mergeCell ref="D2:E3"/></mergeCells><dataValidations count="1"><dataValidation type="whole" sqref="A2:A5"><formula1>1</formula1><formula2>10</formula2></dataValidation></dataValidations></worksheet>',
    ),
  );
  const inserted = applySpreadsheetCommand(artifact, {
    name: 'insert-rows',
    sheetId: '1',
    index: 2,
    count: 2,
  });
  expect(inspectSpreadsheet(inserted, '1', 'A1:E8').cells).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reference: 'A4', value: 3 }),
      expect.objectContaining({ reference: 'B4', value: 'text' }),
      expect.objectContaining({ reference: 'C4', formula: 'SUM($A$1:A4)', formatted: '5' }),
    ]),
  );
  expect(inspectSpreadsheet(inserted, '2').cells).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reference: 'A1', formula: 'Sheet1!A4', formatted: '3' }),
    ]),
  );
  expect(inserted.selectSheet(1).worksheet.document.source).toContain('ref="D4:E5"');
  expect(inserted.selectSheet(1).worksheet.document.source).toContain('sqref="A4:A7"');
  const deleted = applySpreadsheetCommand(inserted, {
    name: 'delete-rows',
    sheetId: '1',
    index: 4,
  });
  expect(
    inspectSpreadsheet(deleted, '1', 'A1:E8').cells.map((cell) => cell.reference),
  ).not.toContain('A4');
  expect(inspectSpreadsheet(deleted, '2').cells[0]?.formula).toBe('#REF!');
  expect(inspectSpreadsheet(artifact, '1').cells.some((cell) => cell.reference === 'A2')).toBe(
    true,
  );
});

test('column edits move widths, frozen panes and cells and reject losing the edge of the Excel grid', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-cell',
    sheetId: '1',
    reference: 'B2',
    value: 42,
  });
  artifact = replaceSheet(artifact, (source) =>
    source.replace(
      '<sheetData>',
      '<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" state="frozen"/><selection activeCell="B2" sqref="B2"/></sheetView></sheetViews><cols><col min="2" max="3" width="20" customWidth="1"/></cols><sheetData>',
    ),
  );
  const result = applySpreadsheetCommand(artifact, {
    name: 'insert-columns',
    sheetId: '1',
    index: 2,
  });
  expect(inspectSpreadsheet(result).cells).toEqual(
    expect.arrayContaining([expect.objectContaining({ reference: 'C2', value: 42 })]),
  );
  expect(result.worksheet.document.source).toContain('min="3" max="4" width="20"');
  expect(result.worksheet.document.source).toContain('xSplit="3"');
  expect(result.worksheet.document.source).toContain('topLeftCell="D2"');
  const edge = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-cell',
    sheetId: '1',
    reference: 'XFD1',
    value: 1,
  });
  expect(() =>
    applySpreadsheetCommand(edge, { name: 'insert-columns', sheetId: '1', index: 1 }),
  ).toThrow('past the Excel grid');
  expect(inspectSpreadsheet(edge, '1', 'XFD1').cells[0]?.value).toBe(1);
});

test('structural operations retain unsupported imported content by failing before any mutation', () => {
  const artifact = replaceSheet(createSpreadsheet(), (source) =>
    source.replace('</worksheet>', '<extLst/></worksheet>'),
  );
  expect(() =>
    applySpreadsheetCommand(artifact, { name: 'insert-rows', sheetId: '1', index: 1 }),
  ).toThrow('extLst');
  expect(artifact.worksheet.document.source).toContain('<extLst/>');
  expect(() =>
    rebaseSpreadsheetFormula('SUM(Table1[Column])', 'Sheet1', 'Sheet1', rows('insert-rows', 1)),
  ).toThrow();
});

function replaceSheet(artifact: SpreadsheetArtifact, change: (source: string) => string) {
  const transaction = beginPackageTransaction(artifact.workbook.package);
  transaction.replacePart(
    artifact.activeSheet.partName,
    new TextEncoder().encode(change(artifact.worksheet.document.source)),
  );
  const workbook = openSpreadsheet(transaction.commitPackage());
  return new SpreadsheetArtifact(
    workbook,
    workbook.sheets.find((sheet) => sheet.sheetId === artifact.activeSheet.sheetId)!,
  );
}

test('structural edits update defined names and conditional formulas and remove deleted validation ranges', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-cell',
    sheetId: '1',
    reference: 'A3',
    value: 8,
  });
  artifact = replaceSheet(artifact, (source) =>
    source.replace(
      '</worksheet>',
      '<conditionalFormatting sqref="A3:A8"><cfRule type="expression" priority="1"><formula>A3&gt;0</formula></cfRule></conditionalFormatting><dataValidations count="1"><dataValidation type="whole" sqref="B3:B4"><formula1>0</formula1></dataValidation></dataValidations></worksheet>',
    ),
  );
  const transaction = beginPackageTransaction(artifact.workbook.package);
  transaction.replacePart(
    artifact.workbook.part.name,
    new TextEncoder().encode(
      artifact.workbook.document.source.replace(
        '</workbook>',
        '<definedNames><definedName name="Revenue">Sheet1!$A$3:$A$8</definedName></definedNames></workbook>',
      ),
    ),
  );
  const workbook = openSpreadsheet(transaction.commitPackage());
  artifact = new SpreadsheetArtifact(workbook, workbook.sheets[0]!);
  const inserted = applySpreadsheetCommand(artifact, {
    name: 'insert-rows',
    sheetId: '1',
    index: 2,
    count: 2,
  });
  expect(inserted.workbook.document.source).toContain('Sheet1!$A$5:$A$10');
  expect(inserted.workbook.document.source).toContain('fullCalcOnLoad="1"');
  expect(inserted.worksheet.document.source).toContain('sqref="A5:A10"');
  expect(inserted.worksheet.document.source).toContain('<formula>A5>0</formula>');
  const removed = applySpreadsheetCommand(inserted, {
    name: 'delete-rows',
    sheetId: '1',
    index: 5,
    count: 2,
  });
  expect(removed.worksheet.document.source).not.toContain('dataValidations');
  expect(removed.workbook.document.source).toContain('Sheet1!$A$5:$A$8');
});
