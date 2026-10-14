import type { Doc } from './types';

export const wordCollaborationDoc: Doc = {
  title: 'Collaborative editing',
  description: 'Apply anchored text, formatting, image, and table operations through Yjs.',
  sections: [
    { id: 'setup', title: 'Install the optional adapter', blocks: [
        { kind: 'code', language: 'Terminal', code: `bun add @tumblerjs/word yjs` },
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
        { kind: 'text', text: 'Anchors use Yjs character identities rather than XML element IDs. The adapter preflights the whole batch and rejects stale expected text, invalid ranges, split graphemes, and unsupported structure. Apply the returned delta synchronously to the same document state.' },
        { kind: 'text', text: 'Commands accept any named top-level Y.Text, so body and story streams can have independent histories.' },
        { kind: 'table', headers: ['Change kind', 'Purpose'], rows: [
          ['replace / format', 'Replace anchored text or patch text and paragraph attributes.'],
          ['image / image-update / image-move', 'Insert an image, change its metadata, or move it to an anchored destination.'],
          ['table / table-edit', 'Insert a table or apply a supported structural table action.'],
          ['table-format', 'Change cell, row, column, or table formatting without replacing cell text.'],
        ] },
        { kind: 'text', text: 'Table changes identify tableId and cellId as well as the anchored target. A table-format patch selects its scope and can carry cell, row, and columnWidths changes. Images use the adapter DocumentImage metadata; hosts own asset bytes and validate their references.' },
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
        { kind: 'text', text: 'Keep the original source artifact and its manifest immutable. Source IDs refer to that original package, including across later exports. The host maps shared text and attributes to WordContentBlock trees, then calls model.update with the current tree.' },
        { kind: 'text', text: 'The adapter does not automatically convert arbitrary Y.Text attributes into a complete imported document.' },
        { kind: 'text', text: 'Source references retain styles, sections, links, numbering, table properties, drawings, and opaque XML during supported edits. Reusing source on a split paragraph represents a continuation. An independent copied paragraph or run fragment needs a new sourceCopy identity.' },
        { kind: 'text', text: 'Repeated source tables and rows are detected as copies.' },
    ] },
    { id: 'validation', title: 'Validate host-owned data', blocks: [
        { kind: 'text', text: 'createWordCommands accepts validateAttributes and validateUpdate hooks for host schemas and immutable asset/source references. validateDocument(staged, original) inspects the preflight replica without decoding another update. It runs synchronously, must not mutate either document, and can throw to reject the batch.' },
        { kind: 'text', text: 'If both document and encoded-update hooks exist, both run.' },
        { kind: 'text', text: 'defaultAttributes(text, range) supplies formatting defaults for the selected document range, including paragraph-style inheritance. A replace change can include a format patch so replacement text and its formatting commit together.' },
        { kind: 'text', text: 'Built-in operation validation is not an authorization system: enforce permissions and validate incoming remote updates at the host boundary.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-collaboration.ts',
  next: { href: '/docs/word-search', label: 'Find and replace' },
};
