import type { Doc } from './types';

export const wordCollaborationDoc: Doc = {
  title: 'Collaborative editing',
  description: 'Let several people edit one document through Yjs, with edits that stay attached to the right text.',
  sections: [
    { id: 'setup', title: 'Install', blocks: [
      { kind: 'code', language: 'Terminal', code: `bun add @tumblerjs/word yjs` },
      { kind: 'text', text: 'The collaboration API lives in `@tumblerjs/word/collaboration`. Yjs is an optional peer dependency: you only need it for collaboration, and the rest of `@tumblerjs/word` works without it.' },
      { kind: 'note', text: 'Tumbler does not handle the network, sign-in, permissions, saving or showing who is online. Your app provides those.' },
    ] },
    { id: 'commands', title: 'Make an edit', blocks: [
      { kind: 'text', text: 'Edits are made in three steps:' },
      { kind: 'list', ordered: true, items: [
        '`anchorWordRange` turns a start and end offset into an anchor, a range that keeps pointing at the same characters while other people edit.',
        '`wordTransaction` checks a batch of changes against those anchors and returns a Yjs delta.',
        'You apply the delta to the same Yjs document, straight away, inside `transact`.',
      ] },
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
      { kind: 'text', text: '`expected` is the text you think the anchor covers. If someone else has changed it since, the whole batch is rejected instead of overwriting their work. A batch is also rejected for an invalid range, a range that splits a character such as an emoji, or a structure the adapter does not support.' },
      { kind: 'text', text: 'Commands work on any named top-level `Y.Text`, so the body and each header or footer can have its own text and its own undo history.' },
    ] },
    { id: 'change-kinds', title: 'Kinds of change', blocks: [
      { kind: 'table', headers: ['Kind', 'Does'], rows: [
        ['`replace`', 'Replaces the anchored text. Add a `format` patch to format the new text in the same step.'],
        ['`format`', 'Changes text or paragraph formatting.'],
        ['`image`', 'Inserts an image.'],
        ['`image-update`', 'Changes an image\'s size, position, alignment or alt text.'],
        ['`image-move`', 'Moves an image to another anchor.'],
        ['`table`', 'Inserts a table.'],
        ['`table-edit`', 'Inserts or deletes a row or column, merges or splits cells, clears a cell, or deletes the table.'],
        ['`table-format`', 'Formats cells, rows, columns or the whole table without touching cell text.'],
      ] },
      { kind: 'text', text: '`table` inserts a table from `rows` of cell text. `table-edit` and `table-format` also name the `tableId` and `cellId`. Image changes carry `DocumentImage` details only; your app stores the image bytes and checks the references.' },
    ] },
    { id: 'imports', title: 'Collaborate on an existing file', blocks: [
      { kind: 'text', text: 'To start from a DOCX file, import its content as native blocks and keep the original file alongside:' },
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
      { kind: 'text', text: 'Imported blocks keep references to the original file. Those references carry what the native blocks cannot: styles, sections, links, numbering, table properties, drawings and any XML Tumbler does not understand. They survive supported edits and export.' },
      { kind: 'list', items: [
        'Never change the original artifact or its manifest. The references point into them, including in later exports.',
        'Your app converts the shared Yjs text back into `WordContentBlock` trees and calls `model.update` with the current tree. The adapter does not do this conversion for you.',
        'When a paragraph splits, both parts can keep the source reference. A copied paragraph or run needs a new `sourceCopy` identity.',
        'Tables and rows do not need a `sourceCopy`. A repeated source table or row is detected as a copy.',
      ] },
    ] },
    { id: 'validation', title: 'Check edits', blocks: [
      { kind: 'text', text: '`createWordCommands` takes optional hooks for checking edits against your own rules. Each can throw to reject the batch.' },
      { kind: 'table', headers: ['Option', 'Called with'], rows: [
        ['`validateAttributes`', 'The formatting attributes of each change. Replaces the built-in check, so call `validateAttributes` from `@tumblerjs/word/collaboration` in yours to keep it.'],
        ['`validateUpdate`', 'The encoded Yjs state and update.'],
        ['`validateDocument`', 'The staged document and the original, before anything is applied. It must run synchronously and must not change either one.'],
      ] },
      { kind: 'text', text: 'Two more options set the formatting of new text. `defaultAttributes` receives the text and a range, and returns the formatting new text there should get. `defaultFontSize` is the size in points when nothing else sets one, and defaults to 12.' },
      { kind: 'text', text: 'If you pass both `validateDocument` and `validateUpdate`, both run.' },
      { kind: 'note', text: 'These checks are not access control. Check permissions and validate remote updates where they enter your server.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-collaboration.ts',
  next: { href: '/docs/word-search', label: 'Find and replace' },
};
