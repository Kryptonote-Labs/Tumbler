import type { Doc } from './types';

export const wordLayoutDoc: Doc = {
  title: 'Page layout and positions',
  description: 'Insert breaks, set indents and tabs, and map text positions to page geometry.',
  sections: [
    { id: 'sections', title: 'Page setup', blocks: [
      { kind: 'text', text: '`NativeWordDocument.updateSettings` changes page setup. Layout and export use the same settings.' },
      { kind: 'table', headers: ['Setting', 'Sets'], rows: [
        ['`background`', 'The page colour, as RGB or a theme colour. `null` removes it.'],
        ['`finalSection`', 'Paper size, orientation, margins and columns of the last section, in twips.'],
      ] },
      { kind: 'text', text: 'To end a section early, give a paragraph `section: { format }`. A section format can also turn on line numbers with `lineNumbers: { countBy, start, restart }`.' },
      { kind: 'note', text: 'Pagination can still differ from Word when a font is missing or the document uses layout behaviour Tumbler does not support. Embedded fonts and the file\'s own kerning help it match.' },
      { kind: 'text', text: '`paintWordPage` draws a laid-out page onto a canvas, using the same layout as the Svelte views, so you can render pages without a browser. Your code provides text measurement, paths, fonts and decoded images.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/word/README.md', label: 'Headless layout, canvas painting and native persistence APIs' },
    ] },
    { id: 'breaks', title: 'Insert a break', blocks: [
      { kind: 'text', text: 'A break is a run whose text is a single U+2028 line separator. Set `breakType` to `\'line\'`, `\'page\'` or `\'column\'`; the type survives import, layout and export. To start a new paragraph, add another paragraph block instead.' },
      { kind: 'code', code: `import { NativeWordDocument } from '@tumblerjs/word';

const model = new NativeWordDocument();
model.update([{
  kind: 'paragraph', runs: [
    { text: 'Before' },
    { text: '\\u2028', breakType: 'page' },
    { text: 'After' },
  ],
}]);` },
    ] },
    { id: 'positioning', title: 'Indents and tabs', blocks: [
      { kind: 'text', text: 'Set a paragraph\'s indents and tab stops on its `positioning`. Distances are in twips, a twentieth of a point, so 1440 twips is one inch.' },
      { kind: 'code', code: `import type { WordContentBlock } from '@tumblerjs/word';

const heading: WordContentBlock = {
  kind: 'paragraph',
  positioning: {
    indentStartTwips: 360,
    tabs: [{ positionTwips: 7200, alignment: 'end', leader: 'dot' }],
  },
  runs: [{ text: 'Summary	3' }],
};` },
      { kind: 'table', headers: ['Field', 'Sets'], rows: [
        ['`indentStartTwips`', 'Indent from the start margin.'],
        ['`indentEndTwips`', 'Indent from the end margin.'],
        ['`firstLineTwips`', 'Extra indent for the first line.'],
        ['`hangingTwips`', 'How far the first line hangs out past the other lines.'],
        ['`tabs`', 'Tab stops, each with a position, alignment and leader.'],
      ] },
      { kind: 'text', text: 'A positional tab is a run whose text is one tab character, with `tab: { alignment, relativeTo, leader }`. `alignment` is `\'left\'`, `\'center\'` or `\'right\'`, and `relativeTo` is `\'margin\'` or `\'indent\'`.' },
      { kind: 'text', text: 'To read positioning back from an opened document, call `document.styles.paragraphFormat(document, paragraph)`. It returns the values that apply after styles are inherited. `document.styles.paragraphPositioning(document, paragraph)` returns only what the paragraph declares itself, including tab stops it explicitly clears.' },
    ] },
    { id: 'hit-testing', title: 'Points and lines', blocks: [
      { kind: 'text', text: 'Three functions turn page coordinates into text positions:' },
      { kind: 'list', items: [
        '`wordLineAtPoint` finds the line under a point, in body text or a table cell.',
        '`wordAdjacentLine` moves to the line above or below, across pages, columns and cells, and into headers and footers.',
        '`wordClickAndTypeTarget` turns a click in blank space into a caret position and what to insert there.',
      ] },
      { kind: 'text', text: 'Coordinates are in points, relative to the page and before zoom. Your code converts screen coordinates and applies the resulting edit.' },
    ] },
    { id: 'positions', title: 'Text positions', blocks: [
      { kind: 'text', text: '`NativeWordDocument.paragraphs()` lists every paragraph in document order, including those in table cells, with its ID, its text, and its start and end offsets. Offsets count like this:' },
      { kind: 'list', items: [
        'Each UTF-16 code unit is one position.',
        'One separator sits between consecutive paragraphs.',
        'A tab or line break is one position.',
        'An image or shape is one U+FFFC character.',
      ] },
      { kind: 'note', text: 'Offsets describe the current revision only. Remap them after every edit.' },
    ] },
    { id: 'plain-text', title: 'Plain-text editing', blocks: [
      { kind: 'text', text: '`NativeWordText` holds plain paragraphs and edits them by offset. `transact` applies a list of edits as one change.' },
      { kind: 'code', code: `import { NativeWordText, NativeWordTextLayout, type WordTextMeasurer } from '@tumblerjs/word';

declare const measurer: WordTextMeasurer;

const text = new NativeWordText('Hello\\nWorld');
text.transact([
  { start: 5, deleteCount: 0, insert: ' there' },
  { start: 12, deleteCount: 5, insert: 'Tumbler' },
]);
// Hello there\\nTumbler
const lines = new NativeWordTextLayout(measurer, 450);
const geometry = text.paragraphs.map(paragraph => lines.paragraph(paragraph));
const plainDocx = text.docx();` },
      { kind: 'text', text: '`transact` applies its edits in order:' },
      { kind: 'list', items: [
        'Each edit sees the text as the previous edit left it, which is why the second edit above starts at 12.',
        'If any edit is invalid, the whole transaction is rejected.',
        'Unchanged paragraphs keep their IDs. When a paragraph splits, the first part keeps the ID and the new parts get fresh ones.',
      ] },
      { kind: 'text', text: '`NativeWordTextLayout` measures the lines of plain paragraphs. It does not paginate a rich document.' },
    ] },
    { id: 'limits', title: 'Layout budgets', blocks: [
      { kind: 'text', text: 'Layout work is capped by budgets. When a document exceeds one, layout throws a `limit_exceeded` error instead of returning truncated content. Raise a budget to lay out larger documents.' },
      { kind: 'table', headers: ['Option', 'Default'], rows: [
        ['`maxCharacters`', '5,000,000 UTF-16 units'],
        ['`maxAtoms`', '1,000,000'],
        ['`maxMeasurements`', '1,000,000 calls to your text measurer per layout pass'],
        ['`maxFragments`', '1,000,000'],
        ['`maxPages`', '10,000'],
      ] },
      { kind: 'text', text: '`pageLimit` is different: it stops after that many pages without an error, for previews. Body paragraphs are then prepared only up to the preview and a short lookahead. Tables and repeated content such as headers are still prepared in full, within the budgets.' },
      { kind: 'text', text: 'There is no limit on the number of blocks or cells, nesting depth or image size. Inputs still need valid dimensions, list levels and document structure, and ZIP and XML parsing has its own resource limits.' },
      { kind: 'link', href: '/docs/word-support#word', label: 'Word support and remaining gaps' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-layout.ts',
  next: { href: '/docs/word-stories', label: 'Headers and page numbers' },
};
