import type { Doc } from './types';

export const wordStoriesDoc: Doc = {
  title: 'Headers and page numbers',
  description: 'Edit shared headers and footers, select section variants, and insert page fields.',
  sections: [
    { id: 'stories', title: 'Headers and footers', blocks: [
        { kind: 'code', code: `import { NativeWordDocument, openWordArtifact, wordPageNumberRuns } from '@tumblerjs/word';

const source = openWordArtifact(bytes);
const model = new NativeWordDocument({ source });
const footer = model.updateStory({ section: 0, kind: 'footer', type: 'default' }, [{
  kind: 'paragraph', alignment: 'end',
  runs: wordPageNumberRuns('page-x-of-y'),
}]);
const positions = footer.paragraphs();
const edited = model.artifact().bytes();` },
        { kind: 'table', headers: ['Target', 'Behavior'], rows: [
          ['section', 'Zero-based index; creates or updates the section reference'],
          ['type', 'default, first, or even variant'],
          ['Part name', 'Edits the shared story for every section that references or inherits it'],
        ] },
        { kind: 'text', text: 'Resolve part names from source.document.headerFooters. Do not assume a filename such as /word/header1.xml.' },
        { kind: 'table', headers: ['API', 'Result'], rows: [
          ['updateStory', 'Returns a child NativeWordDocument with region-local positions'],
          ['removeStory', 'Removes the native override and restores source behavior; retains the original package part'],
          ['wordStoryArtifact', 'Opens an existing story for package editing'],
          ['createWordStory', 'Creates a package-backed story and returns its part name'],
        ] },
        { kind: 'text', text: 'Layout pages expose headerStory and footerStory, including the effective section and variant. First/even variants follow document settings.' },
        { kind: 'text', text: 'Layout reserves body space for repeated stories. storyOverflow reports when a story consumes that space; body layout then falls back to section margins.' },
    ] },
    { id: 'fields', title: 'Live page fields', blocks: [
        { kind: 'text', text: 'wordPageNumberRuns supports plain, page, x-of-y, bold-x-of-y, and page-x-of-y. PAGE and NUMPAGES each occupy one U+FFFC character with a field property. Header/footer layout resolves them before measurement and repeats pagination when the total changes.' },
        { kind: 'text', text: 'Supported simple fields and complete complex PAGE/NUMPAGES fields split across runs import as editable fields. Export writes standard Word fields. Section numbering restarts and numeral formats are not evaluated. General fields such as TOC, REF, and SEQ are not recalculated.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-stories.ts',
  next: { href: '/docs/word-collaboration', label: 'Collaboration' },
};
