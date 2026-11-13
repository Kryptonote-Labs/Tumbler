import type { Doc } from './types';

export const compatibilityDoc: Doc = {
  title: 'Format support',
  description: 'Which formats Tumbler handles today, and how to check a file of your own.',
  sections: [
    { id: 'formats', title: 'Formats', blocks: [
      { kind: 'table', headers: ['Format', 'Works today', 'Missing'], rows: [
        ['DOCX', 'Pages, text editing, formatting, tables, images and supported charts.', 'Some Word layout features. Missing fonts change where pages break.'],
        ['XLSX', 'Large grids, values and ordinary formulas, formatting, tables and supported charts.', 'Some formulas and workbook features.'],
        ['PPTX', 'Slides and thumbnails, text and table editing, formatting, and moving, resizing and rotating objects.', 'SmartArt layout, some shape effects, and full animation.'],
        ['PDF', 'Pages, text selection, search, collaborative text editing, annotations and combining pages.', 'Parts of the PDF standard. Unsupported content raises an error instead of being skipped. Editing needs fonts from your app.'],
        ['DOC, XLS, PPT', 'Not supported.', 'Convert older binary files to DOCX, XLSX or PPTX first.'],
      ] },
    ] },
    { id: 'formats-guides', title: 'Details by format', blocks: [
      { kind: 'link', href: '/docs/word-support', label: 'Word compatibility' },
      { kind: 'link', href: '/docs/spreadsheet-support', label: 'Spreadsheet compatibility' },
      { kind: 'link', href: '/docs/powerpoint-support', label: 'PowerPoint compatibility' },
      { kind: 'link', href: '/docs/pdf#limits', label: 'PDF limits' },
    ] },
    { id: 'checking', title: 'Check one of your files', blocks: [
      { kind: 'list', items: [
        'Keep an unchanged copy of the original.',
        'Open the file in the playground and check the content, page edges and fonts.',
        'Make a small edit and download the result.',
        'Open the download in the app that will use it.',
        'If something differs, report it with a small example that contains nothing confidential.',
      ] },
      { kind: 'text', text: 'Tumbler\'s tests also check files with LibreOffice and the Open XML SDK. Passing those checks shows the tested cases work, not that every Office file will.' },
    ] },
    { id: 'privacy', title: 'Your files stay local', blocks: [
      { kind: 'text', text: 'The playground reads files into browser memory. It never uploads them or saves them to a server. Downloads are built from what is in memory, and reloading the page throws away your edits.' },
      { kind: 'list', items: [
        'The playground accepts DOCX, XLSX and PPTX files up to 20 MB.',
        'In a presentation, external links open in a new tab in View mode. In Edit mode, clicking a link edits its text.',
      ] },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/compatibility.ts',
  next: { href: '/docs/compatibility-reports', label: 'Compatibility reports' },
};
