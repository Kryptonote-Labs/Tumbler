import type { Doc } from './types';

export const wordDoc: Doc = {
  title: 'Word documents',
  description: 'Show and edit DOCX files, or build documents from your own content.',
  sections: [
    { id: 'models', title: 'Choose an approach', blocks: [
      { kind: 'text', text: 'There are two ways to work with Word documents. Pick the one that matches who owns the content.' },
      { kind: 'table', headers: ['If', 'Use', 'Read'], rows: [
        ['Users open a DOCX file and edit it', '`WordDocumentView` with an editing session', '[Open and edit](/docs/word-editing)'],
        ['Your app holds the content and builds the DOCX', '`NativeWordDocument`', '[Native content model](/docs/native-word)'],
        ['Several people edit the same document', '`NativeWordDocument` with the Yjs adapter', '[Collaborative editing](/docs/word-collaboration)'],
      ] },
    ] },
    { id: 'topics', title: 'Document content', blocks: [
      { kind: 'table', headers: ['Topic', 'Covers'], rows: [
        ['[Text and styles](/docs/word-formatting)', 'Fonts, emphasis, spacing and named styles.'],
        ['[Lists and links](/docs/word-lists)', 'Bulleted, numbered and multilevel lists, and hyperlinks.'],
        ['[Tables](/docs/word-tables)', 'Nested tables, column widths, row heights and cell formatting.'],
        ['[Images and shapes](/docs/word-drawings)', 'Inline and floating images, editable shapes, and moving and resizing.'],
        ['[Page layout and positions](/docs/word-layout)', 'Breaks, indents, tabs and text positions.'],
        ['[Headers and page numbers](/docs/word-stories)', 'Headers, footers and live page numbers.'],
      ] },
    ] },
    { id: 'try', title: 'Try it', blocks: [
      { kind: 'text', text: 'The playground opens a sample document. You can edit its text, format it, and move and resize its images.' },
      { kind: 'link', href: '/playground/word-brief', label: 'Open the Word playground' },
      { kind: 'link', href: '/docs/word-support', label: 'What is and is not supported' },
      { kind: 'link', href: '/docs/releases', label: 'What changed in this release' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/word/README.md', label: 'Full @tumblerjs/word API' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word.ts',
  next: { href: '/docs/word-editing', label: 'Open and edit' },
};
