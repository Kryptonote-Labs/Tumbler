import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { insertTableDelta, tableParagraphs, editTableDelta } from '../src/collaboration/index.ts';
import { NativeWordDocument } from '../src/index.ts';

test('horizontal merging and splitting preserve text and undo identities', () => {
  const doc = new Y.Doc(); const text = doc.getText('body'); text.insert(0, '\n');
  text.applyDelta(insertTableDelta(text, 0, [['Title', 'Facts'], ['A', 'B']]).delta);
  const first = tableParagraphs(text).find(p => p.table)!;
  const before = text.toString();
  const undo = new Y.UndoManager(text);
  text.applyDelta(editTableDelta(text, first.start, 'merge-right', first.table!.id, first.table!.cell));
  expect(text.toString()).toBe(before);
  const merged = tableParagraphs(text).filter(p => p.table?.cell === first.table!.cell);
  expect(merged).toHaveLength(2); expect(merged[0]!.table!.span).toBe(2);
  undo.stopCapturing();
  text.applyDelta(editTableDelta(text, first.start, 'split-cell', first.table!.id, first.table!.cell));
  expect(tableParagraphs(text).filter(p => p.table?.row === first.table!.row).map(p => p.table!.span)).toEqual([1, 1, 1]);
  undo.undo();
  expect(text.toString()).toBe(before);
  expect(tableParagraphs(text).find(p => p.table)!.table!.span).toBe(2);
  undo.destroy(); doc.destroy();
});

test('table geometry reports actual point widths and overflow against the page column', () => {
  const model = new NativeWordDocument({ page: { width: 600, height: 800, margin: 60 } });
  model.update([{ kind: 'table', columnWidths: [2600, 2800], rows: [[{ blocks: [{ kind: 'paragraph', runs: [{ text: 'A' }] }] }, { blocks: [{ kind: 'paragraph', runs: [{ text: 'B' }] }] }]] }]);
  expect(model.geometryAt(0)).toMatchObject({ availableWidthPoints: 480, widthPoints: 5400, fitsAvailableWidth: false, columnWidthsPoints: [2600, 2800] });
});

test('geometry uses parent-cell space for nested tables', () => {
  const model = new NativeWordDocument({ page: { width: 600, height: 800, margin: 60 } });
  model.update([{ kind: 'table', columnWidths: [240, 240], rows: [[
    { blocks: [{ kind: 'table', columnWidths: [100, 100], rows: [[
      { blocks: [{ kind: 'paragraph', runs: [{ text: 'Nested' }] }] },
      { blocks: [{ kind: 'paragraph', runs: [{ text: 'Cell' }] }] },
    ]] }] }, { blocks: [{ kind: 'paragraph', runs: [{ text: 'Other' }] }] },
  ]] }]);
  const geometry = model.geometryAt(0, 1);
  expect(geometry.availableWidthPoints).toBeLessThanOrEqual(240);
  expect(geometry.availableWidthPoints).toBeGreaterThan(200);
  expect(geometry).toMatchObject({ widthPoints: 200, fitsAvailableWidth: true });
});
