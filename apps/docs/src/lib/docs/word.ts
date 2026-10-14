import type { Doc } from './types';

export const wordDoc: Doc = {
  title: 'Word documents',
  description: 'Choose a viewer, edit a DOCX, or build on the native content model.',
  sections: [
    { id: 'models', title: 'Choose an integration', blocks: [
        { kind: 'text', text: 'Use WordDocumentView and a Word editing session to render and edit an existing DOCX.' },
        { kind: 'link', href: '/docs/word-editing', label: 'Open and edit a document' },
        { kind: 'text', text: 'Use NativeWordDocument when your application owns rich content, input, and rendering. Add the optional Yjs adapter for anchored human and agent operations.' },
        { kind: 'link', href: '/docs/native-word', label: 'Create and update native content' },
        { kind: 'link', href: '/docs/word-collaboration', label: 'Connect collaborative editing' },
    ] },
    { id: 'topics', title: 'Author document content', blocks: [
        { kind: 'link', href: '/docs/word-formatting', label: 'Text, paragraphs, and styles' },
        { kind: 'link', href: '/docs/word-lists', label: 'Lists and hyperlinks' },
        { kind: 'link', href: '/docs/word-tables', label: 'Tables and cell formatting' },
        { kind: 'link', href: '/docs/word-drawings', label: 'Images and editable shapes' },
        { kind: 'link', href: '/docs/word-layout', label: 'Breaks, tabs, and text positions' },
        { kind: 'link', href: '/docs/word-stories', label: 'Headers, footers, and page numbers' },
    ] },
    { id: 'try', title: 'Try a document', blocks: [
        { kind: 'link', href: '/playground/word-brief', label: 'Open the Word playground' },
        { kind: 'link', href: '/docs/word-support', label: 'Check Word support and limitations' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word.ts',
  next: { href: '/docs/word-editing', label: 'Open and edit' },
};
