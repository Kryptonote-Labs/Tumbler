import type { Doc } from './types';

export const spreadsheetsDoc: Doc = {
  title: 'Spreadsheets',
  description: 'Read, render, and edit XLSX workbooks with a headless model or a Svelte grid.',
  sections: [
    { id: 'alpha-27', title: 'New in alpha.27', blocks: [
      { kind: 'link', href: '/docs/releases', label: 'Authoring additions and migration notes' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/sheets/README.md', label: 'Native commands and package API' },
      { kind: 'link', href: '/docs/charts', label: 'Shared chart authoring and rendering' },
      { kind: 'link', href: '/docs/cli', label: 'Command-line operations' },
    ] },
    { id: 'start', title: 'Open a workbook', blocks: [
      { kind: 'text', text: 'Open XLSX bytes with openSpreadsheetArtifact. Use the worksheet model directly, or render it with SpreadsheetGrid.' },
      { kind: 'link', href: '/docs/spreadsheet-viewer', label: 'Render a worksheet and switch sheets' },
    ] },
    { id: 'edit', title: 'Edit and save', blocks: [
      { kind: 'text', text: 'Write cell values and supported ordinary formulas, format ranges, and export the edited workbook. Formula calculation is bounded; unsupported workbook features remain incomplete.' },
      { kind: 'link', href: '/docs/spreadsheet-editing', label: 'Cell edits, formulas, formatting, and export' },
      { kind: 'link', href: '/docs/spreadsheet-support', label: 'Spreadsheet support and limitations' },
    ] },
    { id: 'try', title: 'Try a workbook', blocks: [
      { kind: 'link', href: '/playground/sheet-budget', label: 'Open the spreadsheet playground' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheets.ts',
  next: { href: '/docs/spreadsheet-viewer', label: 'Open a workbook' },
};
