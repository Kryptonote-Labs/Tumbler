import type { Release } from './types';

export const octoberReleases: readonly Release[] = [
  {
    version: '0.1.0-alpha.26',
    date: '2026-10-14',
    summary: 'Word styles, lists, links, and editable shapes',
    changes: [
      'Author character and paragraph formatting, multilevel lists, hyperlinks, named styles, and explicit line/page/column breaks.',
      'Create seven editable DrawingML shape types and connect in-place shape text editing through WordDrawingView.',
      'Add anchored find/replace, atomic replacement formatting, table geometry controls, and style reset fixes.',
      'Add Word standards and everyday-task compatibility reports. Move compiler checks to TypeScript 7 while retaining the Svelte tooling compiler API.',
    ],
    registryPackage: 'opc',
    commit: '0916b3935bb6927856be7573841fb4d562213fb9',
    previousCommit: '3abf8bdccea65c763d7ea87f7cf88beb0133a208',
  },
  {
    version: '0.1.0-alpha.25',
    date: '2026-10-10',
    summary: 'Native imports, collaboration, and page stories',
    changes: [
      'Import DOCX into NativeWordDocument and retain immutable source references through export.',
      'Add optional anchored Yjs text, formatting, image, and table operations with incremental paragraph/table projections.',
      'Edit shared headers and footers, author PAGE/NUMPAGES fields, and expose positioning, click-and-type, and vertical caret navigation.',
      'Format table cells and geometry, continue rows across pages, and improve line spacing, tabs, list indentation, and drawing preservation.',
    ],
    registryPackage: 'opc',
    commit: '3abf8bdccea65c763d7ea87f7cf88beb0133a208',
    previousCommit: '6b2259b6c970310fa7b8ec6931695acbb21b3087',
  },
  {
    version: '0.1.0-alpha.24',
    date: '2026-10-01',
    summary: 'Native Word content and layout',
    changes: [
      'Add NativeWordDocument for application-owned rich content, stable paragraph identity, and reusable layout geometry.',
      'Add NativeWordText for sequential plain-text transactions and NativeWordTextLayout for headless line layout.',
      'Support Word font sizes through 1638 points.',
    ],
    registryPackage: 'formulas',
    commit: '6b2259b6c970310fa7b8ec6931695acbb21b3087',
    previousCommit: 'f305c5facf74a97a5d1622031734ac2f9fd74b11',
  },
];
