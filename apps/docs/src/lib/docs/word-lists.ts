import type { Doc } from './types';

export const wordListsDoc: Doc = {
  title: 'Lists and links',
  description: 'Create list hierarchies and hyperlinks while retaining surrounding formatting.',
  sections: [
    { id: 'lists', title: 'Numbered and multilevel lists', blocks: [
        { kind: 'code', code: `import { NativeWordDocument, type WordContentBlock } from '@tumblerjs/word';

const model = new NativeWordDocument();
const outline: WordContentBlock[] = [{
  kind: 'paragraph', id: 'item-1',
  list: { id: 'outline', kind: 'decimal', level: 0, start: 3, multilevel: true },
  runs: [{ text: 'Third section' }],
}, {
  kind: 'paragraph', id: 'item-1a',
  list: { id: 'outline', kind: 'lowerLetter', level: 1, multilevel: true },
  runs: [{ text: 'First subsection' }],
}];
model.update(outline);` },
        { kind: 'text', text: 'List kinds are none, bullet, decimal, lowerLetter, upperLetter, lowerRoman, and upperRoman. Set marker for a custom bullet, start for an explicit initial number, and multilevel for compound labels.' },
        { kind: 'text', text: 'Levels run from 0 to 8; each level within one list identity must have a consistent definition. Reuse the identity to continue or choose a new identity to restart.' },
    ] },
    { id: 'links', title: 'Create or remove a hyperlink', blocks: [
        { kind: 'code', code: `import { NativeWordDocument } from '@tumblerjs/word';

const model = new NativeWordDocument();
model.update([{
  kind: 'paragraph', runs: [
    { text: 'Project website', link: 'https://example.com' },
  ],
}]);` },
        { kind: 'text', text: 'Runs can author HTTP(S), mailto, tel, and bookmark links. Set link to an empty string to remove an imported hyperlink while retaining its text and formatting. Source-aware export retains unchanged wrappers and remaps new external relationships.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-lists.ts',
  next: { href: '/docs/word-tables', label: 'Tables' },
};
