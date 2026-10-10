import type { Doc } from './docs';

export const wordAuthoringDoc: Doc = {
  title: 'Word authoring',
  description: 'Create rich documents, format tables, edit headers and footers, and insert live page numbers with the headless Word engine.',
  sections: [
    { id: 'content', title: 'Paragraphs, lists, and tables', blocks: [
      { kind: 'text', text: 'Use createWordArtifact for a one-off DOCX or NativeWordDocument for repeated edits and layout. Both accept WordContentBlock trees. Paragraphs contain formatted runs; table cells contain their own blocks, including nested tables.' },
      { kind: 'code', code: `import { NativeWordDocument, type WordContentBlock } from '@tumblerjs/word';

const blocks: WordContentBlock[] = [
  { kind: 'paragraph', id: 'title', runs: [
    { text: 'Project brief', format: { bold: true, fontSizePoints: 18 } },
  ] },
  { kind: 'paragraph', id: 'task', list: { id: 'tasks', kind: 'decimal' },
    runs: [{ text: 'Review the draft' }] },
  { kind: 'table', id: 'summary', columnWidths: [180, 270],
    rowFormats: [{ heightRule: 'atLeast', heightTwips: 480 }],
    rows: [[
      { format: { shading: '#EEEEEE', verticalAlignment: 'center' },
        blocks: [{ kind: 'paragraph', runs: [{ text: 'Status' }] }] },
      { blocks: [{ kind: 'paragraph', runs: [{ text: 'Draft' }] }] },
    ]],
  },
];
const model = new NativeWordDocument();
model.update(blocks);
const bytes = model.artifact().bytes();` },
      { kind: 'text', text: 'Reuse a list ID to continue numbering, or use a new ID to restart. Levels run from 0 to 8. Give editable blocks stable IDs across updates. Pass either blocks or the older paragraphs option when creating an artifact, never both.' },
      { kind: 'text', text: 'Column widths and page geometry use points. Cell margins, row heights, paragraph indents, and tab stops use twips: 20 twips equal one point. Cell format supports shading, borders, verticalAlignment, and margins. rowFormats is parallel to rows.' },
      { kind: 'text', text: 'Imported spans and vertical merges retain their source identities. Rows can continue across pages at cell line boundaries, and leading header rows repeat. Direct borders and solid fills are supported; conditional table styles, patterned fills, and theme-based table colours are not fully resolved.' },
    ] },
    { id: 'images', title: 'Inline and floating images', blocks: [
      { kind: 'code', code: `import { createWordArtifact } from '@tumblerjs/word';

const imageBytes = new Uint8Array(await file.arrayBuffer()); // PNG
const artifact = createWordArtifact({ blocks: [{
  kind: 'paragraph', runs: [
    { text: 'Diagram: ' },
    { text: '\uFFFC', image: {
      bytes: imageBytes, contentType: 'image/png',
      width: 160, height: 100, alt: 'System overview',
    } },
  ],
}] });` },
      { kind: 'text', text: 'Authored images accept PNG or JPEG bytes. An image run occupies one U+FFFC character. Set layout to inline, front, or behind; floating images accept alignment, x, y, and moveWithText. Dimensions and offsets use points. x overrides horizontal alignment. y is relative to the paragraph by default, or the page when moveWithText is false.' },
      { kind: 'text', text: 'Reuse the same immutable Uint8Array when changing image geometry so media identity stays stable. Front and behind placement do not reserve text space. Tight and through text wrapping remain incomplete.' },
    ] },
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
      { kind: 'text', text: 'Section indices are zero-based. Variants are default, first, and even. A section target creates or updates that section reference. A part-name target, such as /word/header1.xml, edits the shared story used by every section referencing or inheriting it. Resolve actual part names from source.document.headerFooters rather than assuming filenames.' },
      { kind: 'text', text: 'updateStory returns a child NativeWordDocument with region-local paragraph positions. removeStory removes the native override and restores source behavior; it does not delete the original package part. wordStoryArtifact exposes an existing story to package editing APIs. createWordStory creates a package-backed story and returns its part name.' },
      { kind: 'text', text: 'Layout pages expose headerStory and footerStory metadata, including effective section and variant. Layout reserves body space for repeated stories. storyOverflow reports stories that consume the available page; body layout then falls back to section margins. First/even variants follow document settings.' },
    ] },
    { id: 'fields', title: 'Live page fields', blocks: [
      { kind: 'text', text: 'wordPageNumberRuns supports plain, page, x-of-y, bold-x-of-y, and page-x-of-y. PAGE and NUMPAGES each occupy one U+FFFC character with a field property. Header/footer layout resolves them before measurement and repeats pagination when the total changes.' },
      { kind: 'text', text: 'Supported simple fields and complete complex PAGE/NUMPAGES fields split across runs import as editable fields. Export writes standard Word fields. Section numbering restarts and numeral formats are not evaluated. General fields such as TOC, REF, and SEQ are not recalculated.' },
    ] },
    { id: 'positioning', title: 'Tabs and paragraph positioning', blocks: [
      { kind: 'code', code: `import type { WordContentBlock } from '@tumblerjs/word';

const heading: WordContentBlock = {
  kind: 'paragraph',
  positioning: {
    indentStartTwips: 360,
    tabs: [{ positionTwips: 7200, alignment: 'end', leader: 'dot' }],
  },
  runs: [{ text: 'Summary\t3' }],
};` },
      { kind: 'text', text: 'positioning also accepts indentEndTwips, firstLineTwips, and hangingTwips. A positional tab run uses text containing one tab character and tab: { alignment, relativeTo, leader }. Its alignment is left, center, or right, relative to margin or indent.' },
      { kind: 'text', text: 'wordLineAtPoint handles body text and table-cell hit testing. wordAdjacentLine moves between visual lines across pages, columns, and cells, with header/footer story selection. wordClickAndTypeTarget converts a blank-space point into snapped caret geometry and insertion intent. Coordinates are page-relative points before zoom; the host converts screen coordinates and applies the edit.' },
    ] },
    { id: 'limits', title: 'Validation and layout budgets', blocks: [
      { kind: 'text', text: 'The authoring API no longer applies the former fixed block, cell, nesting, or image-data caps. Inputs still require valid dimensions, list levels, and document structure. ZIP/XML parsing has resource protections, and callers can set maxPages and maxFragments for layout work. A budget failure throws rather than returning silently truncated content.' },
      { kind: 'link', href: '/docs/compatibility#word', label: 'Word support and remaining gaps' },
    ] },
  ],
  next: { href: '/docs/word-collaboration', label: 'Collaborative Word operations' },
};
