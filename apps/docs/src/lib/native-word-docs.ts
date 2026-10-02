import type { Doc } from './docs';

export const nativeWordDoc: Doc = {
  title: 'Native Word documents',
  description: 'Update authored content in memory, reuse page geometry, and create DOCX bytes when exporting.',
  sections: [
    { id: 'model', title: 'Choose a document model', blocks: [
      { kind: 'text', text: 'NativeWordDocument accepts authored paragraphs, rich text, lists, tables, and images. Updates and layout do not create an OPC package or parse XML. It shares the Word pagination engine with package-backed documents.' },
      { kind: 'table', headers: ['Task', 'API'], rows: [
        ['Edit an existing DOCX while retaining its package structures', 'NativeWordDocument({ source })'],
        ['Maintain application-owned rich content and export DOCX', 'NativeWordDocument'],
        ['Apply sequential plain-text edits with paragraph identity', 'NativeWordText'],
        ['Create a DOCX once from authored content', 'createWordArtifact'],
      ] },
      { kind: 'note', text: 'The native APIs are headless. Pass source: openWordArtifact(bytes) to use the same native engine for imports. The optional @tumblerjs/word/collaboration adapter supplies anchored Yjs operations for people and agents. WordDocumentView still expects a package-backed document.' },
    ] },
    { id: 'author', title: 'Create and update rich content', blocks: [
      { kind: 'code', code: `import {
  NativeWordDocument,
  type WordContentBlock,
  type WordTextMeasurer,
} from '@tumblerjs/word';

const document = new NativeWordDocument({
  defaultFormat: { fontFamily: 'Arial', fontSizePoints: 13 },
  lineSpacing: 1.5,
  page: { width: 595.3, height: 841.9, margin: 72 },
});

let blocks: WordContentBlock[] = [
  { kind: 'paragraph', id: 'title', runs: [
    { text: 'Project notes', format: { bold: true } },
  ] },
  { kind: 'paragraph', id: 'body', runs: [{ text: 'First draft.' }] },
];
document.update(blocks);

// Keep the title identity; replace the changed paragraph.
blocks = [blocks[0]!, {
  kind: 'paragraph', id: 'body', runs: [{ text: 'First draft, revised.' }],
}];
document.update(blocks);

// Supply font measurements in points from your renderer.
declare const measurer: WordTextMeasurer;
const layout = document.layout(measurer);
const paragraphs = document.paragraphs();
const bytes = document.artifact().bytes();` },
      { kind: 'text', text: 'update receives the complete current block tree and publishes the new model after validation. It is reconciliation, not an operation log. IDs must be unique across the tree, including table descendants. Give paragraphs and tables stable IDs when inserting or moving content; omitted IDs use structural paths. IDs are application identity and are not serialized into DOCX.' },
      { kind: 'text', text: 'Use the same WordContentBlock structures as createWordArtifact for lists, nested tables, and inline or floating images. Treat supplied blocks, constructor options, and image bytes as immutable after passing them in. Replace changed values before calling update; image cache identity depends on its Uint8Array object.' },
      { kind: 'link', href: '/docs/word', label: 'Word authoring and image examples' },
    ] },
    { id: 'layout', title: 'Reuse layout work', blocks: [
      { kind: 'text', text: 'Unchanged paragraphs retain their objects. Layout caches prepared paragraph geometry and reuses positioned lines and pages when their geometry and content remain unchanged. Wrapping, list markers, available width, and measurer identity participate in invalidation. Keep one measurer object while its font metrics remain valid; replace it when fonts or measurement behavior change.' },
      { kind: 'text', text: 'cache.measuredParagraphs is a cumulative measurement counter for diagnostics. Updates still walk the authored tree and pagination still visits content. This API does not promise constant-time edits or viewport-only pagination. A small edit can move following content and require new page geometry.' },
      { kind: 'text', text: 'layout returns WordLayout, with page, column, line, table, and fragment geometry in points. The application owns rendering, input, selection, and converting points to screen coordinates. Optional maxPages and maxFragments are caller-controlled layout work budgets; exceeding them throws rather than truncating content.' },
    ] },
    { id: 'positions', title: 'Text positions and plain-text transactions', blocks: [
      { kind: 'text', text: 'paragraphs() returns paragraph IDs, text, and start/end offsets in document order, including table cells. Offsets count UTF-16 code units with one separator between paragraphs. Tabs and line breaks each occupy one unit; an image occupies U+FFFC. These flattened positions describe the current revision and must be remapped after edits.' },
      { kind: 'code', code: `import { NativeWordText, NativeWordTextLayout } from '@tumblerjs/word';

const text = new NativeWordText('Hello\\nWorld');
text.transact([
  { start: 5, deleteCount: 0, insert: ' there' },
  { start: 12, deleteCount: 5, insert: 'Tumbler' },
]);
// Hello there\\nTumbler
const revision = text.revision;
const lines = new NativeWordTextLayout(measurer, 450);
const geometry = text.paragraphs.map(paragraph => lines.paragraph(paragraph));
const plainDocx = text.docx();` },
      { kind: 'text', text: 'Edits within transact use sequential positions: each edit sees the result of the previous one. An invalid edit rejects the entire transaction. Unchanged paragraph identities survive; a split retains the first paragraph ID and allocates IDs for the new paragraphs. NativeWordTextLayout measures continuous plain-text paragraph lines, without rich document pagination.' },
    ] },
    { id: 'integration', title: 'Persistence, collaboration, and export', blocks: [
      { kind: 'text', text: 'Keep the authored content or your own operation model as persistent state. Apply local edits immediately, reconcile into NativeWordDocument, and send application-level changes through your chosen transport. The optional collaboration adapter uses Yjs for concurrent character identities and supplies shared text, formatting, image and table operations. The application owns authenticated transport, revisions, retries, durable storage and selection mapping.' },
      { kind: 'text', text: 'Call artifact() when an artifact is needed, and bytes() at the download or file-storage boundary. Export constructs DOCX from current content and preserves source properties and unknown package parts when a source artifact was supplied. Keep that immutable artifact outside the frequently rewritten collaboration head. Avoid exporting and reopening the DOCX on every keystroke, which discards the native model’s identity and caching benefits.' },
    ] },
  ],
  next: { href: '/docs/word', label: 'Package-backed Word editing' },
};
