import type { Doc } from './types';

export const spreadsheetSupportDoc: Doc = {
  title: 'Spreadsheet compatibility',
  description: 'Check the supported grid, calculation, and editing scope.',
  sections: [
    { id: 'grid', title: 'Grid and formatting', blocks: [
        { kind: 'list', items: [
          'Virtualized rows and columns, ordinary merges, frozen panes, and cell formatting.',
          'Table value sorting and supported filters are view projections. They are not written back to the workbook.',
          'Supported conditional rules affect font, fill, and borders. Other rule families remain incomplete.',
        ] },
    ] },
    { id: 'formulas', title: 'Formula limits', blocks: [
        { kind: 'text', text: 'Ordinary formulas use a bounded calculation engine. Unsupported functions and formula structures fall back to producer caches with diagnostics.' },
        { kind: 'list', items: [
          'Shared, array, data-table, dynamic-array, and external-workbook formulas are not editable.',
          'Structural row and column edits are not available.',
          'Editing rich/shared strings replaces the value with plain inline text.',
        ] },
    ] },
    { id: 'charts', title: 'Charts and qualification', blocks: [
        { kind: 'text', text: 'Supported embedded charts render as native overlays. Chart-data authoring, pivots, non-chart drawings, and broader workbook features remain incomplete.' },
        { kind: 'link', href: '/docs/compatibility-reports', label: 'Understand compatibility evidence' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheet-support.ts',
};
