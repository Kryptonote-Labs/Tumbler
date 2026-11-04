import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { wordSharedText, createWordUndoManager, insertTableDelta, tableParagraphs } from '../src/collaboration/index.ts';

test('replace-all spans body paragraphs and cells in one undoable operation', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'Review before\nReview after\n');
  text.applyDelta(insertTableDelta(text, 0, [['Review cell', 'review peer']]).delta);
  const view = wordSharedText(text);
  const before = view.text.toString();
  const cells = tableParagraphs(view.text).filter(p => p.table).map(p => p.table);
  const undo = createWordUndoManager(doc, { trackedOrigins: new Set(['editor']) });
  try {
    const edit = view.prepareOperation({ start: 0, end: view.text.length - 1 }, { name: 'replace-all', input: { query: 'review', value: 'Checked' } });
    doc.transact(() => view.commit(edit), 'editor');
    expect(view.text.toString()).toBe(before.replace(/review/gi, 'Checked'));
    expect(tableParagraphs(view.text).filter(p => p.table).map(p => p.table)).toEqual(cells);
    undo.undo(); expect(view.text.toString()).toBe(before);
    undo.redo(); expect(view.text.toString()).toBe(before.replace(/review/gi, 'Checked'));
  } finally { undo.destroy(); view.destroy(); doc.destroy(); }
});
