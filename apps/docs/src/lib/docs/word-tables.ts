import type { Doc } from './types';

export const wordTablesDoc: Doc = {
  title: 'Tables',
  description: 'Author nested tables and control cell formatting and geometry.',
  sections: [
    { id: 'content', title: 'Create a table', blocks: [
        { kind: 'text', text: 'Table cells contain WordContentBlock arrays, including nested tables. Pass the complete block tree to NativeWordDocument.update or createWordArtifact.' },
        { kind: 'code', code: `import { NativeWordDocument } from '@tumblerjs/word';

const model = new NativeWordDocument();
model.update([{
  kind: 'table', id: 'summary', columnWidths: [180, 270],
  rowFormats: [{ heightRule: 'atLeast', heightTwips: 480 }],
  rows: [[
    { format: { shading: '#EEEEEE', verticalAlignment: 'center' },
      blocks: [{ kind: 'paragraph', runs: [{ text: 'Status' }] }] },
    { blocks: [{ kind: 'paragraph', runs: [{ text: 'Draft' }] }] },
  ]],
}]);
const bytes = model.artifact().bytes();` },
    ] },
    { id: 'geometry', title: 'Set dimensions and cell formatting', blocks: [
        { kind: 'table', headers: ['Property', 'Units or values'], rows: [
          ['columnWidths', 'Points, in column order'],
          ['rowFormats', 'One entry per row; row heights use twips'],
          ['Cell format', 'shading, borders, verticalAlignment, and margins'],
          ['Cell margins', 'Twips, 20 per point'],
        ] },
    ] },
    { id: 'imports', title: 'Imported tables and pagination', blocks: [
        { kind: 'text', text: 'Imported spans and vertical merges retain their source identities. Rows can continue across pages at cell line boundaries, and leading header rows repeat.' },
        { kind: 'text', text: 'Direct borders and solid fills are supported; conditional table styles, patterned fills, and theme-based table colours are not fully resolved.' },
        { kind: 'link', href: '/docs/word-collaboration', label: 'Anchored table edits and formatting' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-tables.ts',
  next: { href: '/docs/word-drawings', label: 'Images and shapes' },
};
