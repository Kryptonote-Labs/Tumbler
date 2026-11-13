import type { Doc } from './types';

export const wordSupportDoc: Doc = {
  title: 'Word compatibility',
  description: 'What Tumbler can show and edit in a Word document, and what is still missing.',
  sections: [
    { id: 'word', title: 'Text and structure', blocks: [
      { kind: 'table', headers: ['Content', 'Supported', 'Missing'], rows: [
        ['Text and paragraphs', 'Fonts, emphasis, highlight, superscript and subscript, spacing, page-flow rules, shading and simple borders. The built-in Normal, Title, Subtitle and Heading 1–9 styles.', 'Decorative borders.'],
        ['Lists', 'Nine levels, bullets, numbers, letters, Roman numerals, custom bullets, multilevel labels and custom start numbers.', '—'],
        ['Links and breaks', 'Web, email, phone and bookmark links. Line, page and column breaks.', '—'],
        ['Tables', 'Nested tables, merged cells, cell formatting, rows that break across pages, and repeating header rows.', 'Conditional table styles, such as banded rows.'],
      ] },
    ] },
    { id: 'pages', title: 'Pages and drawings', blocks: [
      { kind: 'table', headers: ['Content', 'Supported', 'Missing'], rows: [
        ['Headers and footers', 'Editing, first-page and even-page variants, and live page numbers.', 'Section numbering restarts and number formats.'],
        ['Fields', 'Page number fields are editable.', 'Contents pages, cross-references and other fields are not recalculated.'],
        ['Images', 'Inline, in front of text and behind text. Moving and resizing images and charts.', 'Wrapping text around an image\'s outline.'],
        ['Shapes', 'Nine shapes with fills, gradients, outlines, rounded corners, editable text and stacking order.', 'Grouped and transformed shapes are kept but not editable. Shape effects.'],
        ['Footnotes and endnotes', 'Displayed.', 'Note numbering, and moving body text to make room for notes.'],
      ] },
      { kind: 'note', text: 'Pages can break differently from Word when a font is missing, when keep-together rules interact, or in complex layouts.' },
    ] },
    { id: 'review', title: 'Review features', blocks: [
      { kind: 'text', text: 'Simple tracked insertions and deletions are recognised. Comments, full change review, content controls and equations cannot be edited and are not fully displayed.' },
      { kind: 'note', text: 'Content Tumbler cannot display is still kept in the file, so it survives a save, but it may not be visible.' },
    ] },
    { id: 'playground', title: 'In the playground', blocks: [
      { kind: 'text', text: 'The Word playground lets you edit text, apply basic formatting, and move and resize images and charts.' },
      { kind: 'text', text: 'It does not yet have:' },
      { kind: 'list', items: [
        'pasting formatted text;',
        'a find and replace panel;',
        'navigation by heading.',
      ] },
      { kind: 'text', text: 'The native and collaborative APIs have no built-in UI, so the playground does not use them. Your app provides the controls.' },
      { kind: 'link', href: '/docs/word-collaboration', label: 'Collaborative editing' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-support.ts',
};
