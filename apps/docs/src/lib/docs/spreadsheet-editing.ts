import type { Doc } from './types';

export const spreadsheetEditingDoc: Doc = {
  title: 'Cells and formulas',
  description: 'Write values and formulas, apply range formatting, and export XLSX bytes.',
  sections: [
    { id: 'formulas', title: 'Values and formulas', blocks: [
        { kind: 'text', text: 'Inline grid edits are literal values. SpreadsheetFormulaBar interprets a leading equals sign as a formula. The headless API takes formula source without that leading sign.' },
        { kind: 'code', code: `import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

let artifact = openSpreadsheetArtifact(bytes);
artifact = artifact
  .editCell('B2', 120)
  .editCell('B3', 80)
  .editFormula('B4', 'SUM(B2:B3)');

artifact.worksheet.cell('B4')?.formula; // SUM(B2:B3)
artifact.calculation.displayText('B4'); // 200` },
    ] },
    { id: 'formatting', title: 'Formatting and export', blocks: [
        { kind: 'code', code: `artifact = artifact.applyFormatting('A1:D1', {
  text: { bold: { set: true } },
  block: { horizontalAlignment: { set: 'center' } }
});

const output = artifact.bytes();` },
        { kind: 'note', text: 'Ordinary formulas are editable. Shared, array, data-table, dynamic-array, and external-workbook formula structures are not currently editable.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheet-editing.ts',
  next: { href: '/docs/spreadsheet-support', label: 'Spreadsheet compatibility' },
};
