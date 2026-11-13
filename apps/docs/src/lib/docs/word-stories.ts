import type { Doc } from './types';

export const wordStoriesDoc: Doc = {
  title: 'Headers and page numbers',
  description: 'Edit headers and footers, choose which pages they apply to, and insert page numbers.',
  sections: [
    { id: 'stories', title: 'Edit a header or footer', blocks: [
      { kind: 'text', text: '`updateStory` replaces the content of one header or footer. Name it by section and kind, and give it the new blocks:' },
      { kind: 'code', code: `import { NativeWordDocument, openWordArtifact, wordPageNumberRuns } from '@tumblerjs/word';

const source = openWordArtifact(bytes);
const model = new NativeWordDocument({ source });
const footer = model.updateStory({ section: 0, kind: 'footer', type: 'default' }, [{
  kind: 'paragraph', alignment: 'end',
  runs: wordPageNumberRuns('page-x-of-y'),
}]);
const positions = footer.paragraphs();
const edited = model.artifact().bytes();` },
      { kind: 'table', headers: ['Field', 'Means'], rows: [
        ['`section`', 'The section, counting from `0`. If it has no header or footer of this kind yet, one is created.'],
        ['`kind`', '`\'header\'` or `\'footer\'`.'],
        ['`type`', 'Which pages it applies to: `\'default\'`, `\'first\'` or `\'even\'`.'],
      ] },
      { kind: 'text', text: 'Instead of a section, you can pass the part name of an existing header or footer. That edits it everywhere it is used, in every section that refers to it or inherits it. Look part names up in `source.document.headerFooters`; do not guess file names such as `/word/header1.xml`.' },
      { kind: 'text', text: '`updateStory` returns a `NativeWordDocument` for just that header or footer, so `paragraphs()` gives positions within it rather than within the body.' },
      { kind: 'text', text: 'First-page and even-page variants appear only when the document\'s settings turn them on, as in Word.' },
    ] },
    { id: 'story-apis', title: 'Other header and footer APIs', blocks: [
      { kind: 'table', headers: ['API', 'Does'], rows: [
        ['`removeStory`', 'Undoes your `updateStory` changes, so the original from the file is used again.'],
        ['`wordStoryArtifact`', 'Opens an existing header or footer from the file for editing.'],
        ['`createWordStory`', 'Adds a new header or footer to the file and returns its part name.'],
      ] },
    ] },
    { id: 'layout', title: 'In the page layout', blocks: [
      { kind: 'text', text: 'Each laid-out page has `headerStory` and `footerStory`, which say which header and footer it uses and from which section.' },
      { kind: 'text', text: 'Layout makes room in the body for the header and footer. If one is too tall for that room, the page sets `storyOverflow`, and the body falls back to the section\'s margins.' },
    ] },
    { id: 'fields', title: 'Page numbers', blocks: [
      { kind: 'text', text: '`wordPageNumberRuns(preset)` returns ready-made runs with live page numbers:' },
      { kind: 'table', headers: ['Preset', 'Shows'], rows: [
        ['`\'plain\'`', '3'],
        ['`\'page\'`', 'Page 3'],
        ['`\'x-of-y\'`', '3 of 12'],
        ['`\'bold-x-of-y\'`', '3 of 12, in bold'],
        ['`\'page-x-of-y\'`', 'Page 3 of 12'],
      ] },
      { kind: 'text', text: 'Each number is a field: one U+FFFC character with `field: \'PAGE\'` or `field: \'NUMPAGES\'`. Layout fills them in before measuring the header or footer, and paginates again if the page count changes the layout.' },
      { kind: 'text', text: 'Page fields in imported files stay editable, and export writes standard Word fields.' },
      { kind: 'note', text: 'Section numbering restarts and number formats such as roman numerals are not applied yet. Other fields, such as `TOC`, `REF` and `SEQ`, are kept but not recalculated.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-stories.ts',
  next: { href: '/docs/word-collaboration', label: 'Collaborative editing' },
};
