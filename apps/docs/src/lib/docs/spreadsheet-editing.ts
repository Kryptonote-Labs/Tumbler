import type { Doc } from './types';

export const spreadsheetEditingDoc: Doc = {
  title: 'Cells and formulas',
  description: 'Write values and formulas, format ranges, change a workbook\'s structure, and save it.',
  sections: [
    { id: 'formulas', title: 'Values and formulas', blocks: [
      { kind: 'text', text: '`editCell` writes a value and `editFormula` writes a formula. Each returns a new artifact, so chain them or assign each result.' },
      { kind: 'code', code: `import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

let artifact = openSpreadsheetArtifact(bytes);
artifact = artifact
  .editCell('B2', 120)
  .editCell('B3', 80)
  .editFormula('B4', 'SUM(B2:B3)');

artifact.worksheet.cell('B4')?.formula; // SUM(B2:B3)
artifact.calculation.displayText('B4'); // 200` },
      { kind: 'note', text: 'Pass formulas to `editFormula` without the leading `=`. The `=` is only how users type a formula in `SpreadsheetFormulaBar`. Typing in a grid cell always enters a value.' },
      { kind: 'note', text: 'Ordinary formulas can be edited. Shared, array, data-table, dynamic-array and external-workbook formulas are kept but cannot be edited yet.' },
      { kind: 'text', text: '`artifact.calculation` holds the results after your edits. `displayText` returns a cell\'s result as it would appear in the grid.' },
    ] },
    { id: 'formatting', title: 'Format a range', blocks: [
      { kind: 'text', text: '`applyFormatting` takes a range and a patch. Text settings go under `text` and cell layout under `block`.' },
      { kind: 'code', code: `artifact = artifact.applyFormatting('A1:D1', {
  text: { bold: { set: true } },
  block: { horizontalAlignment: { set: 'center' } }
});` },
    ] },
    { id: 'native', title: 'Build or restructure a workbook', blocks: [
      { kind: 'text', text: '`createSpreadsheet` starts an empty workbook with one sheet, `Sheet1`. `applySpreadsheetCommand` applies a named command, or a `batch` of them, and returns the new artifact. Commands are checked before they run.' },
      { kind: 'code', code: `import { createSpreadsheet, applySpreadsheetCommand } from '@tumblerjs/sheets';

let artifact = createSpreadsheet();
artifact = applySpreadsheetCommand(artifact, { name: 'batch', commands: [
  { name: 'set-cell', sheetId: 'Sheet1', reference: 'A1', value: 'Total' },
  { name: 'set-formula', sheetId: 'Sheet1', reference: 'B1', formula: 'SUM(B2:B10)' },
  { name: 'freeze-panes', sheetId: 'Sheet1', rows: 1, columns: 0 },
] });` },
      { kind: 'text', text: '`sheetId` takes a sheet\'s name or its numeric `sheetId` as a string.' },
      { kind: 'table', headers: ['Area', 'Commands'], rows: [
        ['Cells', '`set-cell`, `set-formula`, `set-range`, `clear-range`, `replace-text`'],
        ['Formatting', '`format-cells`, `set-borders`, `set-number-format`, `adjust-number-decimals`, `clear-formatting`, `paint-formatting`'],
        ['Sheets', '`add-sheet`, `rename-sheet`, `move-sheet`, `delete-sheet`, `set-sheet-state`, `set-tab-color`'],
        ['Rows and columns', '`insert-rows`, `delete-rows`, `insert-columns`, `delete-columns`, `set-row-height`, `set-column-width`'],
        ['Layout', '`merge-cells`, `unmerge-cells`, `freeze-panes`'],
        ['Drawings', '`insert-shape`, `insert-image`, `insert-chart`, `move-drawing`, `delete-drawing`'],
      ] },
      { kind: 'text', text: 'When you insert or delete rows and columns, formulas that refer to the moved cells are updated where Tumbler supports the formula.' },
      { kind: 'text', text: '`formulaFunctionCatalog` and `formulaFunctionCategories` from `@tumblerjs/formulas` list the available functions, for building a function picker. Functions that call external services need your app to provide those services.' },
      { kind: 'link', href: '/docs/charts', label: 'Charts' },
    ] },
    { id: 'export', title: 'Save', blocks: [
      { kind: 'text', text: '`artifact.bytes()` returns the workbook as XLSX bytes, with all your edits.' },
      { kind: 'code', code: `const output = artifact.bytes();` },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheet-editing.ts',
  next: { href: '/docs/spreadsheet-support', label: 'Spreadsheet compatibility' },
};
