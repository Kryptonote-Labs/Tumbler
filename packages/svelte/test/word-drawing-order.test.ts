import { expect, test } from 'bun:test';
import { layoutWordDocument, openWordArtifact } from '@tumblerjs/word';
import { pictureFixture } from '../../word/test/picture-fixture.ts';
import { wordDrawingStackOrder, wordDrawingOverlayOrder } from '../src/word-drawing-order.ts';

test('floating ranks retain unsigned order, stable ties and separate text layers', () => {
  const document = openWordArtifact(pictureFixture({ anchors: [4294967295, 2147483648, 0, 0] })).document;
  const page = layoutWordDocument(document, { measure: () => ({ width: 5, ascent: 8, descent: 2 }) }).pages[0]!;
  const drawings = [...document.drawings.values()];
  const order = wordDrawingStackOrder(page);
  expect(drawings.map(d => order.get(d))).toEqual([5, 4, 2, 3]);
  expect(wordDrawingOverlayOrder(order)).toBe(6);
  expect(wordDrawingOverlayOrder(new Map())).toBe(3);
  const behind = { ...page, columns: page.columns.map(c => ({ ...c, lines: c.lines.map(l => ({ ...l, fragments: l.fragments.map(f => f.drawing ? { ...f, drawing: { ...f.drawing, anchor: { ...f.drawing.anchor!, behindDocument: true } } } : f) })) })) };
  expect([...wordDrawingStackOrder(behind).values()]).toEqual([-4, -3, -2, -1]);
});
