import type { Doc } from './types';

export const wordFormattingDoc: Doc = {
  title: 'Text and styles',
  description: 'Apply character formatting, paragraph properties, and named styles.',
  sections: [
    { id: 'formatting', title: 'Format text and paragraphs', blocks: [
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
        { kind: 'text', text: 'Pass formatted runs and paragraph properties to NativeWordDocument.update. Omitted properties inherit from the document or paragraph style.' },
    ] },
    { id: 'properties', title: 'Formatting properties', blocks: [
        { kind: 'table', headers: ['Property', 'Values or units'], rows: [
          ['fontFamily / fontSizePoints', 'Font name and point size'],
          ['bold / italic / underline / strike', 'Character emphasis'],
          ['color / highlight', 'Text colour and Word highlight names, such as yellow'],
          ['verticalAlign', 'baseline, superscript, or subscript'],
          ['characterSpacingPoints', 'Signed spacing in points'],
          ['spacingBeforeTwips / spacingAfterTwips', 'Paragraph spacing, 20 twips per point'],
          ['lineSpacing', 'auto: 240 units per line; exact or atLeast: twips'],
        ] },
        { kind: 'text', text: 'Paragraphs also support keepNext, keepLines, pageBreakBefore, widowControl, contextualSpacing, shading, and basic borders. Border artwork and automatic joining between paragraphs remain unqualified.' },
    ] },
    { id: 'styles', title: 'Apply or reset a style', blocks: [
        { kind: 'text', text: 'Set styleId to Normal, Title, Subtitle, or Heading1 through Heading9. Imported style definitions take precedence over the built-ins.' },
        { kind: 'list', items: [
          'To reset direct formatting, omit paragraph and each run\'s format in the update.',
          'Retained properties remain explicit overrides. This includes effective formatting returned by importWordContent.',
        ] },
    ] },
    { id: 'selection', title: 'Format a selection', blocks: [
        { kind: 'text', text: 'Read the selection formatting state from the artifact and use WORD_FORMATTING_CAPABILITIES with FormattingToolbar. Applying a patch records an undoable session revision.' },
        { kind: 'code', code: `import { openWordEditingSession, type WordTextSelection } from '@tumblerjs/word';

const session = openWordEditingSession(bytes);
declare const selection: WordTextSelection;

session.applyFormatting(selection, {
  text: { bold: { set: true }, fontSize: { set: 16 } }
});

session.undo();
session.redo();` },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-formatting.ts',
  next: { href: '/docs/word-lists', label: 'Lists and links' },
};
