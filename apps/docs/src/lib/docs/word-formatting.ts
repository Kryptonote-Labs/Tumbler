import type { Doc } from './types';

export const wordFormattingDoc: Doc = {
  title: 'Text and styles',
  description: 'Format text and paragraphs, apply named styles, and format the user\'s selection.',
  sections: [
    { id: 'formatting', title: 'Format text and paragraphs', blocks: [
      { kind: 'text', text: 'Formatting lives on the blocks you pass to `NativeWordDocument.update`. A run\'s `format` styles its characters. A paragraph\'s `paragraph` property sets its spacing and flow. Anything you leave out comes from the paragraph\'s style or the document defaults.' },
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
    ] },
    { id: 'properties', title: 'Text properties', blocks: [
      { kind: 'table', headers: ['Property', 'Sets'], rows: [
        ['`fontFamily`, `fontSizePoints`', 'Font name and size in points.'],
        ['`bold`, `italic`, `underline`, `strike`', 'Emphasis.'],
        ['`color`', 'Text colour.'],
        ['`highlight`', 'A Word highlight colour by name, such as `\'yellow\'`.'],
        ['`verticalAlign`', '`\'baseline\'`, `\'superscript\'` or `\'subscript\'`.'],
        ['`characterSpacingPoints`', 'Extra space between letters, in points. Negative values tighten.'],
      ] },
    ] },
    { id: 'paragraph-properties', title: 'Paragraph properties', blocks: [
      { kind: 'text', text: 'Paragraph spacing is in twips, so 20 twips is one point.' },
      { kind: 'table', headers: ['Property', 'Sets'], rows: [
        ['`spacingBeforeTwips`, `spacingAfterTwips`', 'Space above and below the paragraph.'],
        ['`lineSpacing`', 'With `rule: \'auto\'`, `value` is in 240ths of a line, so `360` is 1.5 lines. With `\'exact\'` or `\'atLeast\'`, it is in twips.'],
        ['`keepNext`', 'Keeps the paragraph on the same page as the next one.'],
        ['`keepLines`', 'Keeps all of the paragraph\'s lines on one page.'],
        ['`pageBreakBefore`', 'Starts the paragraph on a new page.'],
        ['`widowControl`', 'Avoids leaving a single line at the top or bottom of a page.'],
        ['`contextualSpacing`', 'Drops the spacing between paragraphs of the same style.'],
      ] },
      { kind: 'text', text: 'Paragraphs can also have shading and simple borders.' },
      { kind: 'note', text: 'Decorative border art, and borders that join across neighbouring paragraphs, are not tested yet.' },
    ] },
    { id: 'styles', title: 'Apply or reset a style', blocks: [
      { kind: 'text', text: 'Set `styleId` to `Normal`, `Title`, `Subtitle`, or `Heading1` to `Heading9`. If the document has its own definition of a style, that definition is used instead of the built-in one.' },
      { kind: 'text', text: 'To clear direct formatting and go back to the style, leave out the paragraph\'s `paragraph` property and each run\'s `format`, then call `update`.' },
      { kind: 'note', text: '`importWordContent` returns the formatting each run actually ends up with. If you pass those blocks back unchanged, that formatting is saved as direct formatting, even where it came from a style.' },
    ] },
    { id: 'selection', title: 'Format a selection', blocks: [
      { kind: 'text', text: 'In an editing session, `applyFormatting` formats the user\'s selection and records it as one undo step.' },
      { kind: 'code', code: `import { openWordEditingSession, type WordTextSelection } from '@tumblerjs/word';

const session = openWordEditingSession(bytes);
declare const selection: WordTextSelection;

session.applyFormatting(selection, {
  text: { bold: { set: true }, fontSize: { set: 16 } }
});

session.undo();
session.redo();` },
      { kind: 'text', text: 'To build a toolbar, pass the artifact\'s formatting state for the selection and `WORD_FORMATTING_CAPABILITIES` to `FormattingToolbar`, and apply its patches with `applyFormatting`.' },
      { kind: 'link', href: '/components/formatting-toolbar', label: 'FormattingToolbar' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-formatting.ts',
  next: { href: '/docs/word-lists', label: 'Lists and links' },
};
