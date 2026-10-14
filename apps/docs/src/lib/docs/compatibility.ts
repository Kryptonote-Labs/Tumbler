import type { Doc } from './types';

export const compatibilityDoc: Doc = {
  title: 'Format support',
  description: 'Find the right compatibility guide and check an edited file.',
  sections: [
    { id: 'formats', title: 'Current scope', blocks: [
        { kind: 'table', headers: ['Format', 'Available today', 'Limits'], rows: [
          ['DOCX', 'Paginated rendering, text edits, formatting, tables, embedded images, and supported charts.', 'Incomplete Word layout and feature coverage. Font availability affects pagination.'],
          ['XLSX', 'Virtualized grid, cell and ordinary formula edits, formatting, tables, and supported charts.', 'Formula and workbook feature coverage remains incomplete.'],
          ['DOC / XLS / PPT', 'Not supported.', 'Convert legacy binary files to DOCX, XLSX, or PPTX first.'],
          ['PPTX', 'Slide viewing, thumbnail navigation, text and table-cell editing, formatting, and object movement, resizing, and rotation.', 'Table row/column operations, SmartArt relayout, 3D effects, and full animation/layout fidelity remain unsupported.'],
          ['PDF', 'No viewer in this playground.', 'PDF rendering is outside the current format packages.'],
        ] },
    ] },
    { id: 'formats-guides', title: 'Support by format', blocks: [
        { kind: 'link', href: '/docs/word-support', label: 'Word support and limitations' },
        { kind: 'link', href: '/docs/spreadsheet-support', label: 'Spreadsheet support and limitations' },
        { kind: 'link', href: '/docs/powerpoint-support', label: 'PowerPoint support and limitations' },
    ] },
    { id: 'checking', title: 'Check a real document', blocks: [
        { kind: 'list', items: [
          'Keep an unchanged original.',
          'Open the file in the playground and inspect the content, page edges, and fonts.',
          'Make a small edit and download the result.',
          'Reopen the exported file in the application that will consume it.',
          'Report a minimal, non-confidential example when something differs.',
        ] },
        { kind: 'text', text: 'The repository includes package tests and compatibility workflows using LibreOffice and the Open XML SDK. Passing those checks is evidence for the exercised cases, not a guarantee for all Office files.' },
    ] },
    { id: 'privacy', title: 'Local files', blocks: [
        { kind: 'text', text: 'The playground reads selected files into browser memory. It does not upload them or save them to a server. Downloads are generated from the current in-memory artifact. Refreshing the page discards edits.' },
        { kind: 'text', text: 'The playground accepts DOCX, XLSX, and PPTX files up to 20 MB. External links in presentations can open in a new tab in View mode; clicking linked text in Edit mode edits the text.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/compatibility.ts',
  next: { href: '/docs/compatibility-reports', label: 'Compatibility reports' },
};
