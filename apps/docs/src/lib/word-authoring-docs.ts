import type { Doc } from './docs';

export const wordAuthoringDoc: Doc = {
  title: 'Word authoring',
  description: 'Author styled text, lists, tables, links, drawings, and page fields with the headless Word engine.',
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
    { id: 'formatting', title: 'Text, paragraphs, and named styles', blocks: [
      { kind: 'code', code: `import { NativeWordDocument, type WordContentBlock } from '@tumblerjs/word';

const blocks: WordContentBlock[] = [{
  kind: 'paragraph', id: 'heading', styleId: 'Heading1',
  paragraph: {
    spacingBeforeTwips: 240, spacingAfterTwips: 120,
    keepNext: true, keepLines: true,
  },
  runs: [{ text: 'Review notes' }],
}, {
  kind: 'paragraph', id: 'body',
  paragraph: { lineSpacing: { rule: 'auto', value: 360 } },
  runs: [
    { text: 'Old wording', format: { strike: true } },
    { text: ' revised', format: { highlight: 'yellow' } },
    { text: '2', format: { verticalAlign: 'superscript' } },
  ],
}];
const model = new NativeWordDocument();
model.update(blocks);` },
      { kind: 'text', text: 'Run format supports fontFamily, fontSizePoints, bold, italic, underline, color, strike, highlight, verticalAlign, and characterSpacingPoints. Highlight uses Word palette names such as yellow; verticalAlign is baseline, superscript, or subscript. Character spacing uses points and can be negative.' },
      { kind: 'text', text: 'Paragraph properties include before/after spacing, line spacing, keepNext, keepLines, pageBreakBefore, widowControl, contextualSpacing, shading, and basic borders. Spacing uses twips. Automatic line spacing uses 240 units per line, so 360 means 1.5 lines; exact and atLeast values use twips. Border artwork and automatic joining between adjacent paragraphs remain unqualified.' },
      { kind: 'text', text: 'Built-in styleId values are Normal, Title, Subtitle, and Heading1 through Heading9. Imported definitions take precedence over the built-ins. To reset direct formatting when applying a style through model.update, omit the paragraph property and each run\'s format. Properties retained in the update remain explicit overrides, including effective formatting returned by importWordContent.' },
    ] },
    { id: 'lists', title: 'Numbered and multilevel lists', blocks: [
      { kind: 'code', code: `const outline: WordContentBlock[] = [{
  kind: 'paragraph', id: 'item-1',
  list: { id: 'outline', kind: 'decimal', level: 0, start: 3, multilevel: true },
  runs: [{ text: 'Third section' }],
}, {
  kind: 'paragraph', id: 'item-1a',
  list: { id: 'outline', kind: 'lowerLetter', level: 1, multilevel: true },
  runs: [{ text: 'First subsection' }],
}];
model.update(outline);` },
      { kind: 'text', text: 'List kinds are none, bullet, decimal, lowerLetter, upperLetter, lowerRoman, and upperRoman. Set marker for a custom bullet, start for an explicit initial number, and multilevel for compound labels. Levels run from 0 to 8; each level within one list identity must have a consistent definition. Reuse the identity to continue or choose a new identity to restart.' },
    ] },
    { id: 'links-breaks', title: 'Hyperlinks and explicit breaks', blocks: [
      { kind: 'code', code: `model.update([{
  kind: 'paragraph', runs: [
    { text: 'Project website', link: 'https://example.com' },
    { text: '\\u2028', breakType: 'page' },
    { text: 'The next page' },
  ],
}]);` },
      { kind: 'text', text: 'Runs can author HTTP(S), mailto, tel, and bookmark links. Set link to an empty string to remove an imported hyperlink while retaining its text and formatting. Source-aware export retains unchanged wrappers and remaps new external relationships.' },
      { kind: 'text', text: 'An explicit break run contains one U+2028 line-separator character and breakType set to line, page, or column. Import, native layout, and export retain the break type. This is distinct from inserting a new paragraph.' },
    ] },
    { id: 'shapes', title: 'Editable shapes', blocks: [
      { kind: 'code', code: `model.update([{
  kind: 'paragraph', runs: [{ text: '\\uFFFC', shape: {
    preset: 'roundRect', width: 160, height: 72,
    fill: '#DDF5EB', outline: '#24634B', outlineWidth: 1,
    text: 'Review complete', layout: 'inline',
  } }],
}]);
const output = model.artifact().bytes();` },
      { kind: 'text', text: 'The seven presets are rect, roundRect, ellipse, triangle, diamond, rightArrow, and line. Shapes use one U+FFFC object character, point dimensions, solid RGB or none fills/outlines, and plain text. Placement is inline, front, or behind, using the same positioning properties as images. Exports contain editable DrawingML shapes.' },
      { kind: 'text', text: 'WordDrawingView reports in-place text edits through ontextchange when editable and a callback is connected. Double-click a shape or type while it is selected; Escape or blur commits the text. The host updates its native content model. Set layoutControl to false when the host supplies placement controls. WordDocumentView renders shapes, but does not connect this text callback itself.' },
      { kind: 'note', text: 'Imported groups, transformed shapes, theme/effect fills, and text-wrapped shapes remain opaque source drawings. Neighbouring edits retain their markup. Full preset geometry, rich text boxes, and shape effects are not supported by this editable model.' },
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
