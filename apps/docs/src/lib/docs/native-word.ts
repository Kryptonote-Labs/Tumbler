import type { Doc } from './types';

export const nativeWordDoc: Doc = {
  title: 'Native content model',
  description: 'Keep a rich document as plain data, update it on every edit, and build the DOCX only when you need the file.',
  sections: [
    { id: 'model', title: 'Choose an API', blocks: [
      { kind: 'text', text: '`NativeWordDocument` holds a document as paragraphs, text runs, lists, tables and images. Updates and layout work on this in-memory model, without building a DOCX package or parsing XML. Unchanged paragraphs reuse their cached measurements. It paginates with the same engine as documents opened from a file.' },
      { kind: 'table', headers: ['To', 'Use'], rows: [
        ['Edit an existing DOCX and keep everything in it', '`new NativeWordDocument({ source })`'],
        ['Keep your own rich content and export it as DOCX', '`new NativeWordDocument()`'],
        ['Make plain-text edits that keep paragraph IDs', '`NativeWordText`'],
        ['Create a DOCX once from content you already have', '`createWordArtifact`'],
      ] },
      { kind: 'note', text: 'These APIs have no UI. `WordDocumentView` displays a document opened from a DOCX file, so it cannot show a `NativeWordDocument` directly.' },
    ] },
    { id: 'author', title: 'Create and update content', blocks: [
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

// Keep the title as it was; replace the changed paragraph.
blocks = [blocks[0]!, {
  kind: 'paragraph', id: 'body', runs: [{ text: 'First draft, revised.' }],
}];
document.update(blocks);

// Supply font measurements in points from your renderer.
declare const measurer: WordTextMeasurer;
const layout = document.layout(measurer);
const paragraphs = document.paragraphs();
const bytes = document.artifact().bytes();` },
      { kind: 'text', text: '`update` takes the whole document every time, not a list of changes. It compares the new blocks with the old ones, keeps what did not change, and checks the result before using it.' },
      { kind: 'list', items: [
        'Give paragraphs and tables an `id`, so content keeps its identity when you insert or move things around it. Without one, a block is identified by its position.',
        'IDs must be unique across the whole document, including inside tables. They are yours: they are not saved in the DOCX.',
        'Do not change blocks, options or image bytes after passing them in. Build new values and call `update` again.',
        'Reuse the same `Uint8Array` for an unchanged image, so it is not decoded again.',
      ] },
      { kind: 'text', text: 'Blocks use the same `WordContentBlock` shapes as `createWordArtifact`, so lists, nested tables and images work the same way in both.' },
      { kind: 'link', href: '/docs/word-drawings', label: 'Images and shapes' },
    ] },
    { id: 'imports', title: 'Start from an existing DOCX', blocks: [
      { kind: 'code', code: `import { openWordArtifact, importWordContent, NativeWordDocument } from '@tumblerjs/word';

const source = openWordArtifact(bytes);
const model = new NativeWordDocument({ source });
const content = importWordContent(source);
model.update(content);
const output = model.artifact().bytes();` },
      { kind: 'text', text: 'Passing `source` already imports the file\'s content. Call `importWordContent` when you also want the blocks, for example to edit them in your own UI.' },
      { kind: 'note', text: 'Keep the original artifact unchanged. Imported blocks refer back to it, not to any later export.' },
      { kind: 'text', text: '`WordPackageDocument` is a compatibility subclass. It requires `source` and exposes the imported blocks as `original`.' },
      { kind: 'link', href: '/docs/word-stories#stories', label: 'Edit shared headers and footers' },
    ] },
    { id: 'integration', title: 'Save and collaborate', blocks: [
      { kind: 'text', text: 'Store the content blocks, or your own record of changes, as your app\'s state. Apply each edit locally straight away, pass the result to `update`, and send the change to other users however your app syncs data.' },
      { kind: 'text', text: 'Build the file only when you need it. `artifact()` returns an artifact for the current content, and `bytes()` gives you the DOCX to download or store. When you started from a file, the export keeps that file\'s settings and any parts Tumbler does not understand.' },
      { kind: 'note', text: 'Do not export and reopen the DOCX on every keystroke. It throws away the IDs and caching that make the native model fast.' },
      { kind: 'text', text: 'For several people editing at once, the optional `@tumblerjs/word/collaboration` adapter uses Yjs to keep edits attached to the right text.' },
      { kind: 'link', href: '/docs/word-collaboration', label: 'Collaborative editing' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/native-word.ts',
  next: { href: '/docs/word-formatting', label: 'Text and styles' },
};
