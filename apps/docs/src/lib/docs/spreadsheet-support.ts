import type { Doc } from './types';

export const spreadsheetSupportDoc: Doc = {
  title: 'Spreadsheet compatibility',
  description: 'What the grid shows, what calculates, what you can edit, and what is missing.',
  sections: [
    { id: 'grid', title: 'Grid and formatting', blocks: [
      { kind: 'text', text: 'Supported:' },
      { kind: 'list', items: [
        'Large sheets. Only the visible rows and columns are drawn.',
        'Merged cells, frozen panes and cell formatting.',
        'Conditional formatting rules that compare a cell\'s value or use a formula, when they change the font, fill or borders.',
      ] },
      { kind: 'note', text: 'Sorting and filtering a table only changes what the grid shows. The order is not saved back to the workbook.' },
      { kind: 'text', text: 'Other kinds of conditional formatting, such as colour scales, data bars and icon sets, are not drawn yet.' },
    ] },
    { id: 'formulas', title: 'Formulas', blocks: [
      { kind: 'text', text: 'Ordinary formulas are recalculated by Tumbler\'s own engine, which caps how much work one calculation can do. When a formula uses a function or structure the engine does not support, the grid shows the result last saved in the file and reports a diagnostic.' },
      { kind: 'list', items: [
        'Shared, array, data-table, dynamic-array and external-workbook formulas cannot be edited.',
        'Inserting or deleting rows, columns or sheets updates references in supported formulas only.',
        'Editing a cell that holds rich or shared text replaces it with plain text.',
      ] },
    ] },
    { id: 'charts', title: 'Charts and drawings', blocks: [
      { kind: 'list', items: [
        'Supported charts are drawn over the grid, and you can create and edit them with chart commands.',
        'Pictures, shapes and groups are drawn, and drawing commands can move and change the supported ones.',
      ] },
      { kind: 'note', text: 'Pivot tables are not supported yet, and many less common workbook features are untested.' },
      { kind: 'link', href: '/docs/compatibility-reports', label: 'How compatibility is measured' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheet-support.ts',
};
