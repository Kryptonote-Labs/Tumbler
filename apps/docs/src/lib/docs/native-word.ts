import type { Doc } from './types';

export const nativeWordDoc: Doc = {
  title: 'Native content model',
  description: 'Create and update a rich document without rebuilding its DOCX on every edit.',
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
        { kind: 'text', text: 'update receives the complete current block tree and publishes the new model after validation. It is reconciliation, not an operation log. IDs must be unique across the tree, including table descendants.' },
        { kind: 'text', text: 'Give paragraphs and tables stable IDs when inserting or moving content; omitted IDs use structural paths. IDs are application identity and are not serialized into DOCX.' },
        { kind: 'text', text: 'Use the same WordContentBlock structures as createWordArtifact for lists, nested tables, and inline or floating images. Treat supplied blocks, constructor options, and image bytes as immutable after passing them in.' },
        { kind: 'text', text: 'Replace changed values before calling update; image cache identity depends on its Uint8Array object.' },
        { kind: 'link', href: '/docs/word', label: 'Word authoring and image examples' },
    ] },
    { id: 'imports', title: 'Import an existing DOCX', blocks: [
        { kind: 'code', code: `import { openWordArtifact, importWordContent, NativeWordDocument } from '@tumblerjs/word';

const source = openWordArtifact(bytes);
const model = new NativeWordDocument({ source });
const content = importWordContent(source);
model.update(content);
const output = model.artifact().bytes();` },
        { kind: 'text', text: 'Keep the original artifact immutable. Source identifiers in imported content always refer to that artifact, not a later export. The constructor already imports source content; use importWordContent when your application needs its editable block tree.' },
        { kind: 'text', text: 'WordPackageDocument is a compatibility name for this engine.' },
        { kind: 'link', href: '/docs/word-stories#stories', label: 'Edit shared headers and footers' },
        { kind: 'link', href: '/docs/word-collaboration', label: 'Anchored operations, source manifests, and incremental projections' },
    ] },
    { id: 'integration', title: 'Persistence, collaboration, and export', blocks: [
        { kind: 'text', text: 'Keep the authored content or your own operation model as persistent state. Apply local edits immediately, reconcile into NativeWordDocument, and send application-level changes through your chosen transport.' },
        { kind: 'text', text: 'The optional collaboration adapter uses Yjs for concurrent character identities and supplies shared text, formatting, image and table operations. The application owns authenticated transport, revisions, retries, durable storage and selection mapping.' },
        { kind: 'text', text: 'Call artifact() when an artifact is needed, and bytes() at the download or file-storage boundary. Export constructs DOCX from current content and preserves source properties and unknown package parts when a source artifact was supplied.' },
        { kind: 'text', text: 'Keep that immutable artifact outside the frequently rewritten collaboration head. Avoid exporting and reopening the DOCX on every keystroke, which discards the native model’s identity and caching benefits.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/native-word.ts',
  next: { href: '/docs/word-formatting', label: 'Text and styles' },
};
