import type { Doc } from './types';

export const spreadsheetsDoc: Doc = {
  title: 'Spreadsheets',
  description: 'Open, display, edit and save XLSX workbooks, with or without a UI.',
  sections: [
    { id: 'start', title: 'Where to start', blocks: [
      { kind: 'text', text: '`openSpreadsheetArtifact` opens XLSX bytes. You can read and edit the result in code, or show it in a `SpreadsheetGrid` and let users edit it.' },
      { kind: 'table', headers: ['To', 'Read'], rows: [
        ['Show a worksheet and switch between sheets', '[Open a spreadsheet](/docs/spreadsheet-viewer)'],
        ['Write values and formulas, format cells and save', '[Cells and formulas](/docs/spreadsheet-editing)'],
        ['Check what is supported', '[Spreadsheet compatibility](/docs/spreadsheet-support)'],
        ['Add or edit charts', '[Charts](/docs/charts)'],
        ['Edit workbooks from the command line', '[Command-line editing](/docs/cli)'],
      ] },
    ] },
    { id: 'try', title: 'Try it', blocks: [
      { kind: 'text', text: 'The playground opens a sample budget workbook in the grid, with a formula bar and toolbar.' },
      { kind: 'link', href: '/playground/sheet-budget', label: 'Open the spreadsheet playground' },
      { kind: 'link', href: '/docs/releases', label: 'What changed in this release' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/sheets/README.md', label: 'Full @tumblerjs/sheets API' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheets.ts',
  next: { href: '/docs/spreadsheet-viewer', label: 'Open a spreadsheet' },
};
