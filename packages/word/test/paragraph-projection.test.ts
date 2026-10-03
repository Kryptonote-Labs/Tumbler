import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { WordParagraphProjection, WordTableProjection, groupTableParagraphs, insertTableDelta, type WordParagraphSlice, isTableCell } from '../src/collaboration/index.ts';

function equivalent(text: Y.Text, paragraphs: readonly WordParagraphSlice[]) {
  const copy = new Y.Doc();
  copy.getText('body').applyDelta(paragraphs.flatMap(paragraph => paragraph.parts.map(part => ({ ...part }))));
  const characters = (body: Y.Text) => {
    const parts: readonly { insert: unknown; attributes?: unknown }[] = body.toDelta();
    return parts.flatMap(part => [...String(part.insert)].map(character => ({ character, attributes: part.attributes ?? {} })));
  };
  expect(characters(copy.getText('body'))).toEqual(characters(text));
  let offset = 0;
  for (const paragraph of paragraphs) {
    offset += paragraph.length;
    if (!paragraph.terminated) { expect(paragraph.id).toBe('end'); continue; }
    const identity = Y.createRelativePositionFromTypeIndex(text, offset - 1).item!;
    expect(paragraph.id).toBe(`${identity.client}:${identity.clock}`);
  }
  copy.destroy();
}

test('paragraph projection preserves untouched objects through formatting, joins, splits, undo and remote edits', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'One\nTwo\nThree\n');
  let projected = 0;
  const projection = new WordParagraphProjection(text, paragraph => { projected++; return paragraph; });
  const initial = projection.paragraphs;
  const undo = new Y.UndoManager(text);
  text.insert(5, 'new');
  equivalent(text, projection.paragraphs);
  expect(projected).toBe(4);
  expect(projection.paragraphs[0]).toBe(initial[0]);
  expect(projection.paragraphs[2]).toBe(initial[2]);
  text.format(0, 8, { bold: true });
  equivalent(text, projection.paragraphs);
  text.delete(3, 1);
  text.insert(2, '\ninserted\n', { italic: true });
  text.format(0, 3, { bold: null });
  equivalent(text, projection.paragraphs);
  undo.undo();
  equivalent(text, projection.paragraphs);
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  peer.getText('body').insert(0, 'Remote\n');
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
  equivalent(text, projection.paragraphs);
  text.delete(0, text.length);
  equivalent(text, projection.paragraphs);
  text.insert(0, 'Unterminated');
  equivalent(text, projection.paragraphs);
  projection.destroy();
  peer.destroy(); doc.destroy();
});

test('paragraph projection matches full CRDT content after sequential mixed edits', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  const projection = new WordParagraphProjection(text, paragraph => paragraph);
  let seed = 29;
  const random = (max: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 80; i++) {
    const at = random(text.length + 1);
    const length = Math.min(random(7), text.length - at);
    doc.transact(() => {
      if (i % 3 === 0) text.insert(at, ['hello', '\n', 'x\ny\n'][random(3)]!, { bold: i % 2 === 0 });
      else if (i % 3 === 1) text.delete(at, length);
      else text.format(at, length, { bold: null, italic: true });
    });
    equivalent(text, projection.paragraphs);
  }
  projection.destroy(); doc.destroy();
});

test('table projection reuses unaffected trees and validates rebuilt structure', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'Before\n');
  text.applyDelta(insertTableDelta(text, 0, [['One', 'Two'], ['Three', 'Four']]).delta);
  const projection = new WordParagraphProjection(text, slice => {
    const table = slice.parts.at(-1)?.attributes?.table;
    return {
      kind: 'paragraph' as const, id: slice.id, runs: [{ text: slice.parts.map(part => part.insert).join('').replace(/\n$/, '') }],
      ...(isTableCell(table) ? { table } : {}),
    };
  });
  const tables = new WordTableProjection<(typeof projection.paragraphs)[number]>();
  const before = tables.update(projection.paragraphs);
  text.insert(1, 'x');
  const after = tables.update(projection.paragraphs);
  expect(after).toEqual(groupTableParagraphs(projection.paragraphs));
  expect(after[1]).toBe(before[1]);
  text.insert(10, 'Cell edit');
  expect(tables.update(projection.paragraphs)).toEqual(groupTableParagraphs(projection.paragraphs));
  projection.destroy(); doc.destroy();
});
