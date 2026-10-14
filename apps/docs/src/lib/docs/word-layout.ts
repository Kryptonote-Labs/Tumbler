import type { Doc } from './types';

export const wordLayoutDoc: Doc = {
  title: 'Page layout and positions',
  description: 'Insert breaks, align tabs, and map text positions to page geometry.',
  sections: [
    { id: 'breaks', title: 'Insert an explicit break', blocks: [
        { kind: 'code', code: `import { NativeWordDocument } from '@tumblerjs/word';

const model = new NativeWordDocument();
model.update([{
  kind: 'paragraph', runs: [
    { text: 'Before' },
    { text: '\\u2028', breakType: 'page' },
    { text: 'After' },
  ],
}]);` },
        { kind: 'text', text: 'A break run contains one U+2028 line separator. Set breakType to line, page, or column. Import, layout, and export retain this type. Insert a new paragraph separately.' },
    ] },
    { id: 'positioning', title: 'Tabs and paragraph positioning', blocks: [
        { kind: 'code', code: `import type { WordContentBlock } from '@tumblerjs/word';

const heading: WordContentBlock = {
  kind: 'paragraph',
  positioning: {
    indentStartTwips: 360,
    tabs: [{ positionTwips: 7200, alignment: 'end', leader: 'dot' }],
  },
  runs: [{ text: 'Summary	3' }],
};` },
        { kind: 'text', text: 'positioning also accepts indentEndTwips, firstLineTwips, and hangingTwips. A positional tab run uses text containing one tab character and tab: { alignment, relativeTo, leader }. Its alignment is left, center, or right, relative to margin or indent.' },
        { kind: 'text', text: 'wordLineAtPoint handles body text and table-cell hit testing. wordAdjacentLine moves between visual lines across pages, columns, and cells, with header/footer story selection. wordClickAndTypeTarget converts a blank-space point into snapped caret geometry and insertion intent.' },
        { kind: 'text', text: 'Coordinates are page-relative points before zoom; the host converts screen coordinates and applies the edit.' },
    ] },
    { id: 'positions', title: 'Text positions and plain-text transactions', blocks: [
        { kind: 'text', text: 'paragraphs() returns paragraph IDs, text, and start/end offsets in document order, including table cells. Offsets count UTF-16 code units with one separator between paragraphs. Tabs and line breaks each occupy one unit; an image or shape occupies U+FFFC.' },
        { kind: 'text', text: 'These flattened positions describe the current revision and must be remapped after edits.' },
        { kind: 'code', code: `import { NativeWordText, NativeWordTextLayout } from '@tumblerjs/word';

const text = new NativeWordText('Hello\\nWorld');
text.transact([
  { start: 5, deleteCount: 0, insert: ' there' },
  { start: 12, deleteCount: 5, insert: 'Tumbler' },
]);
// Hello there\\nTumbler
const revision = text.revision;
declare const measurer: import('@tumblerjs/word').WordTextMeasurer;
const lines = new NativeWordTextLayout(measurer, 450);
const geometry = text.paragraphs.map(paragraph => lines.paragraph(paragraph));
const plainDocx = text.docx();` },
        { kind: 'text', text: 'Edits within transact use sequential positions: each edit sees the result of the previous one. An invalid edit rejects the entire transaction. Unchanged paragraph identities survive; a split retains the first paragraph ID and allocates IDs for the new paragraphs.' },
        { kind: 'text', text: 'NativeWordTextLayout measures continuous plain-text paragraph lines, without rich document pagination.' },
    ] },
    { id: 'limits', title: 'Validation and layout budgets', blocks: [
        { kind: 'text', text: 'The authoring API no longer applies the former fixed block, cell, nesting, or image-data caps. Inputs still require valid dimensions, list levels, and document structure. ZIP/XML parsing has resource protections, and callers can set maxPages and maxFragments for layout work.' },
        { kind: 'text', text: 'A budget failure throws rather than returning silently truncated content.' },
        { kind: 'link', href: '/docs/word-support#word', label: 'Word support and remaining gaps' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-layout.ts',
  next: { href: '/docs/word-stories', label: 'Headers and page numbers' },
};
