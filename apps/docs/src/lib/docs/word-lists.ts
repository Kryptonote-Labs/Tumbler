import type { Doc } from './types';

export const wordListsDoc: Doc = {
  title: 'Lists and links',
  description: 'Create bulleted, numbered and multilevel lists, and add or remove links.',
  sections: [
    { id: 'lists', title: 'Lists', blocks: [
      { kind: 'text', text: 'A paragraph becomes a list item when it has a `list` property. Paragraphs with the same list `id` belong to one list and number in sequence.' },
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
      { kind: 'table', headers: ['Field', 'Sets'], rows: [
        ['`id`', 'Which list the item belongs to. Reuse an `id` to continue a list; use a new one to restart numbering.'],
        ['`kind`', '`bullet`, `decimal`, `lowerLetter`, `upperLetter`, `lowerRoman`, `upperRoman` or `none`.'],
        ['`level`', 'Nesting depth, from `0` to `8`.'],
        ['`start`', 'The first number, if not 1.'],
        ['`marker`', 'A custom bullet character.'],
        ['`multilevel`', 'Includes the parent numbers in each label, such as 3.a.'],
      ] },
      { kind: 'note', text: 'Every item at the same level of one list must use the same settings. Changing `kind` partway through a level is rejected.' },
    ] },
    { id: 'links', title: 'Links', blocks: [
      { kind: 'text', text: 'Give a run a `link` to make its text a hyperlink. The link can be any URL, such as `https:`, `mailto:` or `tel:`, or `#name` for a bookmark in the same document.' },
      { kind: 'code', code: `import { NativeWordDocument } from '@tumblerjs/word';

const model = new NativeWordDocument();
model.update([{
  kind: 'paragraph', runs: [
    { text: 'Project website', link: 'https://example.com' },
  ],
}]);` },
      { kind: 'text', text: 'To remove a link from imported text, set `link` to an empty string. The text and its formatting stay.' },
      { kind: 'text', text: 'When you export a file you opened, unchanged links are written back exactly as they were.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-lists.ts',
  next: { href: '/docs/word-tables', label: 'Tables' },
};
