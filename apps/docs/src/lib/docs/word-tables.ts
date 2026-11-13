import type { Doc } from './types';

export const wordTablesDoc: Doc = {
  title: 'Tables',
  description: 'Create tables, including nested ones, and set their sizes and cell formatting.',
  sections: [
    { id: 'content', title: 'Create a table', blocks: [
      { kind: 'text', text: 'A table block has `rows`, and each cell holds its own `blocks`. A cell can contain any block, including another table. Pass the table to `NativeWordDocument.update` or `createWordArtifact` like any other block.' },
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
    { id: 'geometry', title: 'Sizes and cell formatting', blocks: [
      { kind: 'note', text: 'Tables mix units. Column widths are in points, but row heights and cell margins are in twips, where 20 twips is one point.' },
      { kind: 'table', headers: ['Property', 'Sets'], rows: [
        ['`columnWidths`', 'Each column\'s width in points, left to right.'],
        ['`rowFormats`', 'One entry per row. `heightTwips` is the height, and `heightRule` is `\'auto\'`, `\'atLeast\'` or `\'exact\'`.'],
        ['`format.shading`', 'The cell\'s background colour.'],
        ['`format.borders`', 'Borders per side, each with a style, width in points and colour.'],
        ['`format.verticalAlignment`', '`\'top\'`, `\'center\'` or `\'bottom\'`.'],
        ['`format.margins`', 'Space inside the cell, in twips.'],
      ] },
    ] },
    { id: 'imports', title: 'Tables from existing files', blocks: [
      { kind: 'list', items: [
        'Merged cells keep their merges when you edit and export.',
        'A row can break across pages between lines of text.',
        'Header rows at the top of a table repeat on each page.',
      ] },
      { kind: 'note', text: 'Direct borders and solid fills are drawn. Conditional table styles, such as banded rows, patterned fills and theme table colours are not fully applied yet.' },
      { kind: 'link', href: '/docs/word-collaboration#change-kinds', label: 'Table edits in collaborative documents' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-tables.ts',
  next: { href: '/docs/word-drawings', label: 'Images and shapes' },
};
