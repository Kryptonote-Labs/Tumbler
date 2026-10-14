import type { Doc } from './docs';

export const wordCollaborationDoc: Doc = {
  title: 'Word collaboration',
  description: 'Use the same anchored editing operations for people and agents, with optional Yjs synchronization.',
  sections: [
    { id: 'setup', title: 'Install the optional adapter', blocks: [
      { kind: 'code', language: 'Terminal', code: 'bun add @tumblerjs/word yjs' },
      { kind: 'text', text: 'Import collaboration APIs from @tumblerjs/word/collaboration. Yjs is an optional peer dependency; the native document engine and package APIs work without it. The host owns authenticated transport, permissions, persistence, and presence.' },
    ] },
    { id: 'commands', title: 'Apply an anchored transaction', blocks: [
      { kind: 'code', code: `import * as Y from 'yjs';
import { createWordCommands } from '@tumblerjs/word/collaboration';

const shared = new Y.Doc();
const body = shared.getText('body');
body.insert(0, 'Hello world\\n');
const commands = createWordCommands({ defaultFontSize: 12 });
const target = commands.anchorWordRange(body, { start: 0, end: 5 });
const delta = commands.wordTransaction(body, [{
  kind: 'replace', target, expected: 'Hello', value: 'Welcome',
}]);
shared.transact(() => body.applyDelta(delta), 'local-edit');` },
      { kind: 'text', text: 'Anchors use Yjs character identities rather than XML element IDs. The adapter preflights the whole batch and rejects stale expected text, invalid ranges, split graphemes, and unsupported structure. Apply the returned delta synchronously to the same document state. Commands accept any named top-level Y.Text, so body and story streams can have independent histories.' },
      { kind: 'table', headers: ['Change kind', 'Purpose'], rows: [
        ['replace / format', 'Replace anchored text or patch text and paragraph attributes.'],
        ['image / image-update / image-move', 'Insert an image, change its metadata, or move it to an anchored destination.'],
        ['table / table-edit', 'Insert a table or apply a supported structural table action.'],
        ['table-format', 'Change cell, row, column, or table formatting without replacing cell text.'],
      ] },
      { kind: 'text', text: 'Table changes identify tableId and cellId as well as the anchored target. A table-format patch selects its scope and can carry cell, row, and columnWidths changes. Images use the adapter DocumentImage metadata; hosts own asset bytes and validate their references.' },
    ] },
    { id: 'search', title: 'Find and replace', blocks: [
      { kind: 'code', code: `import { findWordMatches, replaceWordMatches } from '@tumblerjs/word/collaboration';

const options = { matchCase: false, wholeWord: true };
const matches = findWordMatches(body.toString(), 'draft', options);
const replacements = replaceWordMatches(body, 'draft', 'final', options);
const replacementDelta = commands.wordTransaction(body, replacements);
shared.transact(() => body.applyDelta(replacementDelta), 'replace-all');` },
      { kind: 'text', text: 'Search is literal, Unicode-aware, and returns UTF-16 ranges at grapheme boundaries. Options include matchCase, wholeWord, and locale for word segmentation. Queries cannot span paragraph separators or embedded object placeholders. replaceWordMatches anchors all matches before mutation; pass the full change list to one wordTransaction for an atomic replace-all that preserves inherited formatting. The host owns undo grouping.' },
      { kind: 'text', text: 'For one replacement, select one returned change before creating the transaction. These are headless operations; the docs playground does not currently provide a find/replace interface.' },
    ] },
    { id: 'imports', title: 'Retain imported document structure', blocks: [
      { kind: 'code', code: `import {
  openWordArtifact, importWordContent,
  createWordSourceManifest, NativeWordDocument,
} from '@tumblerjs/word';

const source = openWordArtifact(bytes);
const content = importWordContent(source);
const manifest = createWordSourceManifest(source);
const model = new NativeWordDocument({ source });
model.update(content);
const exported = model.artifact().bytes();` },
      { kind: 'text', text: 'Keep the original source artifact and its manifest immutable. Source IDs refer to that original package, including across later exports. The host maps shared text and attributes to WordContentBlock trees, then calls model.update with the current tree. The adapter does not automatically convert arbitrary Y.Text attributes into a complete imported document.' },
      { kind: 'text', text: 'Source references retain styles, sections, links, numbering, table properties, drawings, and opaque XML during supported edits. Reusing source on a split paragraph represents a continuation. An independent copied paragraph or run fragment needs a new sourceCopy identity. Repeated source tables and rows are detected as copies.' },
    ] },
    { id: 'validation', title: 'Validate host-owned data', blocks: [
      { kind: 'text', text: 'createWordCommands accepts validateAttributes and validateUpdate hooks for host schemas and immutable asset/source references. validateDocument(staged, original) inspects the preflight replica without decoding another update. It runs synchronously, must not mutate either document, and can throw to reject the batch. If both document and encoded-update hooks exist, both run.' },
      { kind: 'text', text: 'defaultAttributes(text, range) supplies formatting defaults for the selected document range, including paragraph-style inheritance. A replace change can include a format patch so replacement text and its formatting commit together. Built-in operation validation is not an authorization system: enforce permissions and validate incoming remote updates at the host boundary.' },
    ] },
    { id: 'projection', title: 'Reuse unchanged paragraphs and tables', blocks: [
      { kind: 'text', text: 'WordParagraphProjection(body, project) consumes transaction deltas and calls project only for changed slices when paragraphs is read. Slices include stable terminator identity, UTF-16 length, formatted parts, and the terminating newline when present. Call destroy when finished. wordParagraphIdentity exposes the underlying terminator identity.' },
      { kind: 'text', text: 'WordTableProjection.update(paragraphs) reuses unchanged table trees while checking table contiguity. Treat slices and projected values as immutable. NativeWordDocument({ immutableContent: true }) additionally caches authored signatures by object identity; every supplied descendant must remain immutable.' },
      { kind: 'text', text: 'Updates still require document traversal for offsets, numbering, and source continuations. Export at download or persistence boundaries rather than rebuilding and reparsing DOCX on every keystroke.' },
    ] },
    { id: 'placement', title: 'Composed placement and page numbers', blocks: [
      { kind: 'text', text: 'positionedWordEdit stages a composed placement edit. wordPageNumberRange and wordItemAlignment inspect existing content; pageNumberEdit and alignWordItem create edits for numbering and alignment. clickAndTypeEdit applies the intent returned by wordClickAndTypeTarget. Use these shared operations for human gestures and agent edits.' },
      { kind: 'link', href: '/docs/word-authoring#positioning', label: 'Positioning and page geometry' },
    ] },
  ],
  next: { href: '/docs/native-word', label: 'Native document layout and export' },
};
